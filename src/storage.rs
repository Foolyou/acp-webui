use std::{collections::HashSet, path::PathBuf, str::FromStr};

use anyhow::Context;
use chrono::Utc;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use uuid::Uuid;

use serde_json::Value;

use crate::models::{
    continuity_state, permission_status, role, status, tool_call_status, InboxItem, Message,
    NewReviewArtifact, PermissionOption, PermissionRequest, PermissionRequestRow, ReviewArtifact,
    ReviewArtifactRow, ReviewArtifactSummary, Session, SessionContinuity, SessionDetail,
    SessionListItem, SessionListPermission, TimelineItem, ToolCallRow, UpsertToolCall, Workspace,
};

const APPROVAL_EXPIRED_MESSAGE: &str =
    "Approval expired because the backend restarted. Start a new turn to continue.";

#[derive(Debug, Clone)]
pub struct NewPermissionRequest {
    pub session_id: String,
    pub acp_session_id: String,
    pub acp_request_id: String,
    pub tool_call_id: Option<String>,
    pub title: String,
    pub kind: String,
    pub tool_call_json: Value,
    pub options_json: Value,
}

#[derive(Debug, Clone)]
pub struct Storage {
    pool: SqlitePool,
}

#[derive(Debug, Clone)]
pub struct UpsertReviewArtifactResult {
    pub artifact: ReviewArtifact,
    pub created: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SessionContinuityRow {
    pub continuation_state: String,
    pub restore_failure_message: Option<String>,
    pub restore_started_at: Option<String>,
    pub restore_completed_at: Option<String>,
}

impl Storage {
    pub async fn connect(database_url: &str) -> anyhow::Result<Self> {
        if let Some(path) = sqlite_file_path(database_url) {
            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent).await.with_context(|| {
                    format!(
                        "failed to create SQLite database directory {}",
                        parent.display()
                    )
                })?;
            }
        }

        let options = SqliteConnectOptions::from_str(database_url)?
            .create_if_missing(true)
            .foreign_keys(true);

        let max_connections = if database_url.contains(":memory:") {
            1
        } else {
            5
        };
        let pool = SqlitePoolOptions::new()
            .max_connections(max_connections)
            .connect_with(options)
            .await?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> anyhow::Result<()> {
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        Ok(())
    }

    pub async fn expire_pending_permission_requests_on_startup(&self) -> anyhow::Result<usize> {
        let pending = self.list_pending_permission_request_rows().await?;
        let mut failed_sessions = HashSet::new();
        for request in &pending {
            self.expire_permission_request(&request.id, APPROVAL_EXPIRED_MESSAGE)
                .await?;
            if failed_sessions.insert(request.session_id.clone()) {
                self.update_session_status(&request.session_id, status::FAILED)
                    .await?;
                self.add_system_message(&request.session_id, APPROVAL_EXPIRED_MESSAGE)
                    .await?;
            }
        }
        Ok(pending.len())
    }

    pub async fn repair_restored_running_sessions_on_startup(&self) -> anyhow::Result<u64> {
        let result = sqlx::query(
            r#"
            UPDATE sessions
            SET status = ?,
                updated_at = ?
            WHERE continuation_state = ?
                AND status = ?
                AND NOT EXISTS (
                    SELECT 1
                    FROM permission_requests
                    WHERE permission_requests.session_id = sessions.id
                        AND permission_requests.status = ?
                )
            "#,
        )
        .bind(status::IDLE)
        .bind(now())
        .bind(continuity_state::RESTORED)
        .bind(status::RUNNING)
        .bind(permission_status::PENDING)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn create_workspace(
        &self,
        path: impl AsRef<str>,
        name: Option<String>,
    ) -> anyhow::Result<Workspace> {
        let canonical = tokio::fs::canonicalize(path.as_ref())
            .await
            .with_context(|| format!("workspace path is not accessible: {}", path.as_ref()))?;
        let metadata = tokio::fs::metadata(&canonical).await?;
        anyhow::ensure!(metadata.is_dir(), "workspace path must be a directory");

        let id = Uuid::new_v4().to_string();
        let path = canonical.to_string_lossy().to_string();
        let name = name.unwrap_or_else(|| {
            canonical
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(&path)
                .to_string()
        });
        let now = now();

        sqlx::query(
            r#"
            INSERT OR IGNORE INTO workspaces (id, name, path, created_at)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&name)
        .bind(&path)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.find_workspace_by_path(&path)
            .await?
            .ok_or_else(|| anyhow::anyhow!("workspace was not created"))
    }

    async fn find_workspace_by_path(&self, path: &str) -> anyhow::Result<Option<Workspace>> {
        let workspace = sqlx::query_as::<_, Workspace>(
            r#"
            SELECT id, name, path, created_at
            FROM workspaces
            WHERE path = ?
            "#,
        )
        .bind(path)
        .fetch_optional(&self.pool)
        .await?;

        Ok(workspace)
    }

    pub async fn list_workspaces(&self) -> anyhow::Result<Vec<Workspace>> {
        let workspaces = sqlx::query_as::<_, Workspace>(
            r#"
            SELECT id, name, path, created_at
            FROM workspaces
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(workspaces)
    }

    pub async fn get_workspace(&self, id: &str) -> anyhow::Result<Workspace> {
        let workspace = sqlx::query_as::<_, Workspace>(
            r#"
            SELECT id, name, path, created_at
            FROM workspaces
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(workspace)
    }

    pub async fn create_session(
        &self,
        workspace_id: &str,
        acp_session_id: String,
    ) -> anyhow::Result<Session> {
        let id = Uuid::new_v4().to_string();
        let now = now();

        sqlx::query(
            r#"
            INSERT INTO sessions (
                id,
                workspace_id,
                agent_name,
                acp_session_id,
                external_session_id,
                continuation_state,
                status,
                created_at,
                updated_at
            )
            VALUES (?, ?, 'codex', ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(workspace_id)
        .bind(&acp_session_id)
        .bind(&acp_session_id)
        .bind(continuity_state::LIVE)
        .bind(status::IDLE)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get_session(&id).await
    }

    pub async fn get_session(&self, id: &str) -> anyhow::Result<Session> {
        let session = sqlx::query_as::<_, Session>(
            r#"
            SELECT
                id,
                workspace_id,
                agent_name,
                acp_session_id,
                external_session_id,
                status,
                created_at,
                updated_at
            FROM sessions
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(session)
    }

    pub async fn session_continuity_row(&self, id: &str) -> anyhow::Result<SessionContinuityRow> {
        let row = sqlx::query_as::<_, SessionContinuityRow>(
            r#"
            SELECT continuation_state, restore_failure_message, restore_started_at, restore_completed_at
            FROM sessions
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    pub async fn mark_session_restore_started(&self, id: &str) -> anyhow::Result<String> {
        let now = now();
        sqlx::query(
            r#"
            UPDATE sessions
            SET continuation_state = ?,
                restore_failure_message = NULL,
                restore_started_at = ?,
                restore_completed_at = NULL,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(continuity_state::RESTORING)
        .bind(&now)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(now)
    }

    pub async fn mark_session_restore_succeeded(&self, id: &str) -> anyhow::Result<String> {
        let now = now();
        sqlx::query(
            r#"
            UPDATE sessions
            SET continuation_state = ?,
                status = ?,
                restore_failure_message = NULL,
                restore_completed_at = ?,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(continuity_state::RESTORED)
        .bind(status::IDLE)
        .bind(&now)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(now)
    }

    pub async fn mark_session_restore_failed(&self, id: &str, message: &str) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET continuation_state = ?,
                restore_failure_message = ?,
                restore_completed_at = NULL,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(continuity_state::RESTORE_FAILED)
        .bind(message)
        .bind(now())
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_session_items(&self) -> anyhow::Result<Vec<SessionListItem>> {
        self.list_session_items_query(None).await
    }

    pub async fn list_session_items_for_workspace(
        &self,
        workspace_id: &str,
    ) -> anyhow::Result<Vec<SessionListItem>> {
        self.get_workspace(workspace_id).await?;
        self.list_session_items_query(Some(workspace_id)).await
    }

    async fn list_session_items_query(
        &self,
        workspace_id: Option<&str>,
    ) -> anyhow::Result<Vec<SessionListItem>> {
        let rows = sqlx::query_as::<_, SessionListItemRow>(
            r#"
            SELECT
                s.id AS session_id,
                s.workspace_id,
                s.agent_name,
                s.acp_session_id,
                s.external_session_id,
                s.status,
                s.created_at AS session_created_at,
                s.updated_at AS session_updated_at,
                w.id AS workspace_row_id,
                w.name AS workspace_name,
                w.path AS workspace_path,
                w.created_at AS workspace_created_at,
                COALESCE(artifacts.review_artifact_count, 0) AS review_artifact_count,
                p.id AS permission_id,
                p.title AS permission_title,
                p.kind AS permission_kind,
                p.created_at AS permission_created_at,
                COALESCE(pending_counts.pending_approval_count, 0) AS pending_approval_count
            FROM sessions s
            INNER JOIN workspaces w ON w.id = s.workspace_id
            LEFT JOIN (
                SELECT
                    session_id,
                    COUNT(
                        DISTINCT CASE
                            WHEN tool_call_id IS NOT NULL
                                THEN tool_call_id || '|' || kind || '|' || source
                            ELSE id
                        END
                    ) AS review_artifact_count
                FROM review_artifacts
                GROUP BY session_id
            ) artifacts ON artifacts.session_id = s.id
            LEFT JOIN permission_requests p
                ON p.id = (
                    SELECT pr.id
                    FROM permission_requests pr
                    WHERE pr.session_id = s.id AND pr.status = ?
                    ORDER BY pr.created_at ASC, pr.id ASC
                    LIMIT 1
                )
            LEFT JOIN (
                SELECT session_id, COUNT(*) AS pending_approval_count
                FROM permission_requests
                WHERE status = ?
                GROUP BY session_id
            ) pending_counts ON pending_counts.session_id = s.id
            WHERE (? IS NULL OR s.workspace_id = ?)
            ORDER BY s.updated_at DESC
            "#,
        )
        .bind(permission_status::PENDING)
        .bind(permission_status::PENDING)
        .bind(workspace_id)
        .bind(workspace_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(row_to_session_list_item).collect())
    }

    pub async fn update_session_status(&self, id: &str, next_status: &str) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET status = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(next_status)
        .bind(now())
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn create_message(
        &self,
        session_id: &str,
        message_role: &str,
        content: &str,
        message_status: &str,
    ) -> anyhow::Result<Message> {
        let id = Uuid::new_v4().to_string();
        let now = now();

        sqlx::query(
            r#"
            INSERT INTO messages (id, session_id, role, content, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(session_id)
        .bind(message_role)
        .bind(content)
        .bind(message_status)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get_message(&id).await
    }

    pub async fn create_message_if_missing(
        &self,
        session_id: &str,
        message_role: &str,
        content: &str,
        message_status: &str,
    ) -> anyhow::Result<Option<Message>> {
        let existing = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)
            FROM messages
            WHERE session_id = ? AND role = ? AND content = ?
            "#,
        )
        .bind(session_id)
        .bind(message_role)
        .bind(content)
        .fetch_one(&self.pool)
        .await?;

        if existing > 0 {
            return Ok(None);
        }

        self.create_message(session_id, message_role, content, message_status)
            .await
            .map(Some)
    }

    pub async fn get_message(&self, id: &str) -> anyhow::Result<Message> {
        let message = sqlx::query_as::<_, Message>(
            r#"
            SELECT id, session_id, role, content, status, created_at
            FROM messages
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(message)
    }

    pub async fn list_messages(&self, session_id: &str) -> anyhow::Result<Vec<Message>> {
        let messages = sqlx::query_as::<_, Message>(
            r#"
            SELECT id, session_id, role, content, status, created_at
            FROM messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(messages)
    }

    #[cfg(test)]
    pub async fn session_detail(&self, session_id: &str) -> anyhow::Result<SessionDetail> {
        self.session_detail_with_continuity(session_id, true, None)
            .await
    }

    #[cfg(test)]
    pub async fn session_detail_with_continuity(
        &self,
        session_id: &str,
        continuable: bool,
        view_only_reason: Option<String>,
    ) -> anyhow::Result<SessionDetail> {
        let continuity = if continuable {
            SessionContinuity::live()
        } else {
            SessionContinuity::view_only(
                view_only_reason
                    .clone()
                    .unwrap_or_else(|| "This session is view-only.".to_string()),
            )
        };
        self.session_detail_with_session_continuity(session_id, continuity)
            .await
    }

    pub async fn session_detail_with_session_continuity(
        &self,
        session_id: &str,
        continuity: SessionContinuity,
    ) -> anyhow::Result<SessionDetail> {
        let mut session = self.get_session(session_id).await?;
        let workspace = self.get_workspace(&session.workspace_id).await?;
        let messages = self.list_messages(&session.id).await?;
        let review_artifacts = self.list_review_artifact_summaries(&session.id).await?;
        let tool_calls = self.list_tool_calls(&session.id).await?;
        let permission_rows = self
            .list_permission_request_rows_for_session(&session.id)
            .await?;
        let timeline = build_timeline(&messages, &tool_calls, &permission_rows, &review_artifacts)?;
        let pending_permissions = self.pending_permissions_for_session(&session.id).await?;
        let pending_permission = pending_permissions.first().cloned();
        let pending_approval_count = pending_permissions.len() as i64;
        let failure_message = self
            .latest_permission_failure_for_session(&session.id)
            .await?;
        session.status = normalize_session_status(session.status, pending_approval_count > 0);
        let continuable = continuity.continuable;
        let view_only_reason = continuity.reason.clone().filter(|_| !continuable);

        Ok(SessionDetail {
            session,
            workspace,
            messages,
            review_artifacts,
            timeline,
            pending_permission,
            pending_permissions,
            pending_approval_count,
            queued_approval_count: queued_approval_count(pending_approval_count),
            failure_message,
            continuity,
            continuable,
            view_only_reason,
        })
    }

    pub async fn list_tool_calls(&self, session_id: &str) -> anyhow::Result<Vec<ToolCallRow>> {
        let rows = sqlx::query_as::<_, ToolCallRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_tool_call_id,
                kind,
                title,
                summary,
                status,
                input_json,
                output_json,
                created_at,
                updated_at,
                completed_at
            FROM tool_calls
            WHERE session_id = ?
            ORDER BY created_at ASC
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn upsert_tool_call(&self, input: UpsertToolCall) -> anyhow::Result<ToolCallRow> {
        let now = now();
        let id = Uuid::new_v4().to_string();
        let input_json = serde_json::to_string(&input.input)?;
        let output_json = input
            .output
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let completed_at = if input.status == tool_call_status::RUNNING {
            None
        } else {
            Some(now.clone())
        };

        match input.acp_tool_call_id.as_deref() {
            Some(acp_tool_call_id) => {
                sqlx::query(
                    r#"
                    INSERT INTO tool_calls (
                        id,
                        session_id,
                        acp_tool_call_id,
                        kind,
                        title,
                        summary,
                        status,
                        input_json,
                        output_json,
                        created_at,
                        updated_at,
                        completed_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id, acp_tool_call_id) WHERE acp_tool_call_id IS NOT NULL
                    DO UPDATE SET
                        kind = excluded.kind,
                        title = excluded.title,
                        summary = excluded.summary,
                        status = excluded.status,
                        input_json = excluded.input_json,
                        output_json = COALESCE(excluded.output_json, tool_calls.output_json),
                        updated_at = excluded.updated_at,
                        completed_at = COALESCE(excluded.completed_at, tool_calls.completed_at)
                    "#,
                )
                .bind(&id)
                .bind(&input.session_id)
                .bind(acp_tool_call_id)
                .bind(&input.kind)
                .bind(&input.title)
                .bind(&input.summary)
                .bind(&input.status)
                .bind(&input_json)
                .bind(&output_json)
                .bind(&now)
                .bind(&now)
                .bind(&completed_at)
                .execute(&self.pool)
                .await?;

                self.get_tool_call_by_acp_id(&input.session_id, acp_tool_call_id)
                    .await
            }
            None => {
                sqlx::query(
                    r#"
                    INSERT INTO tool_calls (
                        id,
                        session_id,
                        acp_tool_call_id,
                        kind,
                        title,
                        summary,
                        status,
                        input_json,
                        output_json,
                        created_at,
                        updated_at,
                        completed_at
                    )
                    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(&id)
                .bind(&input.session_id)
                .bind(&input.kind)
                .bind(&input.title)
                .bind(&input.summary)
                .bind(&input.status)
                .bind(&input_json)
                .bind(&output_json)
                .bind(&now)
                .bind(&now)
                .bind(&completed_at)
                .execute(&self.pool)
                .await?;

                self.get_tool_call(&id).await
            }
        }
    }

    async fn get_tool_call(&self, id: &str) -> anyhow::Result<ToolCallRow> {
        let row = sqlx::query_as::<_, ToolCallRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_tool_call_id,
                kind,
                title,
                summary,
                status,
                input_json,
                output_json,
                created_at,
                updated_at,
                completed_at
            FROM tool_calls
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    async fn get_tool_call_by_acp_id(
        &self,
        session_id: &str,
        acp_tool_call_id: &str,
    ) -> anyhow::Result<ToolCallRow> {
        let row = sqlx::query_as::<_, ToolCallRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_tool_call_id,
                kind,
                title,
                summary,
                status,
                input_json,
                output_json,
                created_at,
                updated_at,
                completed_at
            FROM tool_calls
            WHERE session_id = ? AND acp_tool_call_id = ?
            "#,
        )
        .bind(session_id)
        .bind(acp_tool_call_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    pub async fn create_review_artifact(
        &self,
        input: NewReviewArtifact,
    ) -> anyhow::Result<ReviewArtifact> {
        let id = Uuid::new_v4().to_string();
        let now = now();
        let payload_json = serde_json::to_string(&input.payload)?;

        sqlx::query(
            r#"
            INSERT INTO review_artifacts (
                id,
                session_id,
                tool_call_id,
                kind,
                title,
                summary,
                payload_json,
                source,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.session_id)
        .bind(&input.tool_call_id)
        .bind(&input.kind)
        .bind(&input.title)
        .bind(&input.summary)
        .bind(&payload_json)
        .bind(&input.source)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get_review_artifact_for_session(&input.session_id, &id)
            .await
    }

    pub async fn upsert_review_artifact(
        &self,
        input: NewReviewArtifact,
    ) -> anyhow::Result<UpsertReviewArtifactResult> {
        if let Some(tool_call_id) = input.tool_call_id.as_deref() {
            if let Some(existing) = self
                .find_review_artifact_for_tool_call(
                    &input.session_id,
                    tool_call_id,
                    &input.kind,
                    &input.source,
                )
                .await?
            {
                let payload_json = serde_json::to_string(&input.payload)?;
                sqlx::query(
                    r#"
                    UPDATE review_artifacts
                    SET title = ?,
                        summary = ?,
                        payload_json = ?
                    WHERE id = ?
                    "#,
                )
                .bind(&input.title)
                .bind(&input.summary)
                .bind(&payload_json)
                .bind(&existing.id)
                .execute(&self.pool)
                .await?;

                return Ok(UpsertReviewArtifactResult {
                    artifact: self
                        .get_review_artifact_for_session(&input.session_id, &existing.id)
                        .await?,
                    created: false,
                });
            }
        }

        Ok(UpsertReviewArtifactResult {
            artifact: self.create_review_artifact(input).await?,
            created: true,
        })
    }

    pub async fn list_review_artifact_summaries(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<ReviewArtifactSummary>> {
        let rows = sqlx::query_as::<_, ReviewArtifactRow>(
            r#"
            SELECT
                id,
                session_id,
                tool_call_id,
                kind,
                title,
                summary,
                payload_json,
                source,
                created_at
            FROM review_artifacts
            WHERE session_id = ?
            ORDER BY created_at ASC
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        let items = rows
            .into_iter()
            .map(row_to_review_artifact_summary)
            .collect();
        Ok(dedupe_review_artifact_summaries(items))
    }

    pub async fn get_review_artifact_for_session(
        &self,
        session_id: &str,
        artifact_id: &str,
    ) -> anyhow::Result<ReviewArtifact> {
        let row = sqlx::query_as::<_, ReviewArtifactRow>(
            r#"
            SELECT
                id,
                session_id,
                tool_call_id,
                kind,
                title,
                summary,
                payload_json,
                source,
                created_at
            FROM review_artifacts
            WHERE session_id = ? AND id = ?
            "#,
        )
        .bind(session_id)
        .bind(artifact_id)
        .fetch_one(&self.pool)
        .await?;

        row_to_review_artifact(row)
    }

    async fn find_review_artifact_for_tool_call(
        &self,
        session_id: &str,
        tool_call_id: &str,
        kind: &str,
        source: &str,
    ) -> anyhow::Result<Option<ReviewArtifactRow>> {
        let row = sqlx::query_as::<_, ReviewArtifactRow>(
            r#"
            SELECT
                id,
                session_id,
                tool_call_id,
                kind,
                title,
                summary,
                payload_json,
                source,
                created_at
            FROM review_artifacts
            WHERE session_id = ?
              AND tool_call_id = ?
              AND kind = ?
              AND source = ?
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(session_id)
        .bind(tool_call_id)
        .bind(kind)
        .bind(source)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    pub async fn add_system_message(&self, session_id: &str, content: &str) -> anyhow::Result<()> {
        self.create_message(session_id, role::SYSTEM, content, status::IDLE)
            .await?;
        Ok(())
    }

    pub async fn create_permission_request(
        &self,
        input: NewPermissionRequest,
    ) -> anyhow::Result<PermissionRequest> {
        let id = Uuid::new_v4().to_string();
        let now = now();
        let tool_call_json = serde_json::to_string(&input.tool_call_json)?;
        let options_json = serde_json::to_string(&input.options_json)?;

        sqlx::query(
            r#"
            INSERT INTO permission_requests (
                id,
                session_id,
                acp_session_id,
                acp_request_id,
                tool_call_id,
                title,
                kind,
                status,
                tool_call_json,
                options_json,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.session_id)
        .bind(&input.acp_session_id)
        .bind(&input.acp_request_id)
        .bind(&input.tool_call_id)
        .bind(&input.title)
        .bind(&input.kind)
        .bind(permission_status::PENDING)
        .bind(&tool_call_json)
        .bind(&options_json)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.update_session_status(&input.session_id, status::WAITING_APPROVAL)
            .await?;
        self.get_permission_request(&id).await
    }

    pub async fn get_permission_request(&self, id: &str) -> anyhow::Result<PermissionRequest> {
        let row = self.get_permission_request_row(id).await?;
        row_to_permission_request(row)
    }

    pub async fn get_permission_request_row(
        &self,
        id: &str,
    ) -> anyhow::Result<PermissionRequestRow> {
        let request = sqlx::query_as::<_, PermissionRequestRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_session_id,
                acp_request_id,
                tool_call_id,
                title,
                kind,
                status,
                selected_option_id,
                tool_call_json,
                options_json,
                failure_message,
                created_at,
                resolved_at
            FROM permission_requests
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(request)
    }

    pub async fn pending_permission_for_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Option<PermissionRequest>> {
        let row = sqlx::query_as::<_, PermissionRequestRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_session_id,
                acp_request_id,
                tool_call_id,
                title,
                kind,
                status,
                selected_option_id,
                tool_call_json,
                options_json,
                failure_message,
                created_at,
                resolved_at
            FROM permission_requests
            WHERE session_id = ? AND status = ?
            ORDER BY created_at ASC, id ASC
            LIMIT 1
            "#,
        )
        .bind(session_id)
        .bind(permission_status::PENDING)
        .fetch_optional(&self.pool)
        .await?;

        row.map(row_to_permission_request).transpose()
    }

    pub async fn pending_permissions_for_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<PermissionRequest>> {
        let rows = self
            .list_pending_permission_request_rows_for_session(session_id)
            .await?;
        rows.into_iter().map(row_to_permission_request).collect()
    }

    pub async fn list_pending_permission_request_rows_for_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<PermissionRequestRow>> {
        let rows = sqlx::query_as::<_, PermissionRequestRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_session_id,
                acp_request_id,
                tool_call_id,
                title,
                kind,
                status,
                selected_option_id,
                tool_call_json,
                options_json,
                failure_message,
                created_at,
                resolved_at
            FROM permission_requests
            WHERE session_id = ? AND status = ?
            ORDER BY created_at ASC, id ASC
            "#,
        )
        .bind(session_id)
        .bind(permission_status::PENDING)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn list_pending_permission_request_rows(
        &self,
    ) -> anyhow::Result<Vec<PermissionRequestRow>> {
        let rows = sqlx::query_as::<_, PermissionRequestRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_session_id,
                acp_request_id,
                tool_call_id,
                title,
                kind,
                status,
                selected_option_id,
                tool_call_json,
                options_json,
                failure_message,
                created_at,
                resolved_at
            FROM permission_requests
            WHERE status = ?
            ORDER BY created_at ASC, id ASC
            "#,
        )
        .bind(permission_status::PENDING)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    async fn list_permission_request_rows_for_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<PermissionRequestRow>> {
        let rows = sqlx::query_as::<_, PermissionRequestRow>(
            r#"
            SELECT
                id,
                session_id,
                acp_session_id,
                acp_request_id,
                tool_call_id,
                title,
                kind,
                status,
                selected_option_id,
                tool_call_json,
                options_json,
                failure_message,
                created_at,
                resolved_at
            FROM permission_requests
            WHERE session_id = ?
            ORDER BY created_at ASC, id ASC
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn list_inbox_items(&self) -> anyhow::Result<Vec<InboxItem>> {
        let rows = self.list_pending_permission_request_rows().await?;
        let mut items = Vec::new();
        let mut seen_sessions = HashSet::new();
        for row in &rows {
            if !seen_sessions.insert(row.session_id.clone()) {
                continue;
            }
            let mut session = self.get_session(&row.session_id).await?;
            let workspace = self.get_workspace(&session.workspace_id).await?;
            let permission = row_to_permission_request(row.clone())?;
            let pending_approval_count = rows
                .iter()
                .filter(|candidate| candidate.session_id == row.session_id)
                .count() as i64;
            session.status = normalize_session_status(session.status, true);
            items.push(InboxItem {
                session,
                workspace,
                permission,
                queued_approval_count: queued_approval_count(pending_approval_count),
            });
        }
        Ok(items)
    }

    pub async fn resolve_permission_request(
        &self,
        id: &str,
        option_id: &str,
    ) -> anyhow::Result<()> {
        self.transition_permission_request(id, permission_status::SELECTED, Some(option_id), None)
            .await
    }

    pub async fn cancel_permission_request(&self, id: &str) -> anyhow::Result<()> {
        self.transition_permission_request(id, permission_status::CANCELLED, None, None)
            .await
    }

    pub async fn expire_permission_request(&self, id: &str, message: &str) -> anyhow::Result<()> {
        self.transition_permission_request(id, permission_status::EXPIRED, None, Some(message))
            .await
    }

    async fn transition_permission_request(
        &self,
        id: &str,
        next_status: &str,
        selected_option_id: Option<&str>,
        failure_message: Option<&str>,
    ) -> anyhow::Result<()> {
        let result = sqlx::query(
            r#"
            UPDATE permission_requests
            SET status = ?,
                selected_option_id = ?,
                failure_message = ?,
                resolved_at = ?
            WHERE id = ? AND status = ?
            "#,
        )
        .bind(next_status)
        .bind(selected_option_id)
        .bind(failure_message)
        .bind(now())
        .bind(id)
        .bind(permission_status::PENDING)
        .execute(&self.pool)
        .await?;

        anyhow::ensure!(
            result.rows_affected() == 1,
            "permission request is not pending"
        );
        Ok(())
    }

    async fn latest_permission_failure_for_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"
            SELECT failure_message
            FROM permission_requests
            WHERE session_id = ? AND failure_message IS NOT NULL
            ORDER BY resolved_at DESC
            LIMIT 1
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|(message,)| message))
    }
}

#[derive(Debug, sqlx::FromRow)]
struct SessionListItemRow {
    session_id: String,
    workspace_id: String,
    agent_name: String,
    acp_session_id: Option<String>,
    external_session_id: Option<String>,
    status: String,
    session_created_at: String,
    session_updated_at: String,
    workspace_row_id: String,
    workspace_name: String,
    workspace_path: String,
    workspace_created_at: String,
    review_artifact_count: i64,
    permission_id: Option<String>,
    permission_title: Option<String>,
    permission_kind: Option<String>,
    permission_created_at: Option<String>,
    pending_approval_count: i64,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn row_to_permission_request(row: PermissionRequestRow) -> anyhow::Result<PermissionRequest> {
    let tool_call: Value = serde_json::from_str(&row.tool_call_json)?;
    let options_json: Value = serde_json::from_str(&row.options_json)?;
    let options = parse_permission_options(&options_json);

    Ok(PermissionRequest {
        id: row.id,
        session_id: row.session_id,
        acp_session_id: row.acp_session_id,
        tool_call_id: row.tool_call_id,
        title: row.title,
        kind: row.kind,
        status: row.status,
        selected_option_id: row.selected_option_id,
        tool_call,
        options,
        failure_message: row.failure_message,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
    })
}

fn row_to_review_artifact(row: ReviewArtifactRow) -> anyhow::Result<ReviewArtifact> {
    let payload: Value = serde_json::from_str(&row.payload_json)?;
    Ok(ReviewArtifact {
        id: row.id,
        session_id: row.session_id,
        tool_call_id: row.tool_call_id,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        payload,
        source: row.source,
        created_at: row.created_at,
    })
}

fn row_to_review_artifact_summary(row: ReviewArtifactRow) -> ReviewArtifactSummary {
    ReviewArtifactSummary {
        id: row.id,
        session_id: row.session_id,
        tool_call_id: row.tool_call_id,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        source: row.source,
        created_at: row.created_at,
    }
}

fn dedupe_review_artifact_summaries(
    items: Vec<ReviewArtifactSummary>,
) -> Vec<ReviewArtifactSummary> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::with_capacity(items.len());

    for item in items.into_iter().rev() {
        let key = match item.tool_call_id.as_deref() {
            Some(tool_call_id) => format!("tool:{tool_call_id}|{}|{}", item.kind, item.source),
            None => format!("artifact:{}", item.id),
        };
        if seen.insert(key) {
            deduped.push(item);
        }
    }

    deduped.reverse();
    deduped
}

fn normalize_session_status(status: String, has_pending_permission: bool) -> String {
    if has_pending_permission {
        status::WAITING_APPROVAL.to_string()
    } else {
        status
    }
}

fn queued_approval_count(pending_approval_count: i64) -> i64 {
    pending_approval_count.saturating_sub(1).max(0)
}

fn row_to_session_list_item(row: SessionListItemRow) -> SessionListItem {
    let pending_permission = match (
        row.permission_id,
        row.permission_title,
        row.permission_kind,
        row.permission_created_at,
    ) {
        (Some(id), Some(title), Some(kind), Some(created_at)) => Some(SessionListPermission {
            id,
            title,
            kind,
            created_at,
        }),
        _ => None,
    };
    let review_artifact_count = row.review_artifact_count;

    SessionListItem {
        session: Session {
            id: row.session_id,
            workspace_id: row.workspace_id,
            agent_name: row.agent_name,
            acp_session_id: row.acp_session_id,
            external_session_id: row.external_session_id,
            status: normalize_session_status(row.status, pending_permission.is_some()),
            created_at: row.session_created_at,
            updated_at: row.session_updated_at.clone(),
        },
        workspace: Workspace {
            id: row.workspace_row_id,
            name: row.workspace_name,
            path: row.workspace_path,
            created_at: row.workspace_created_at,
        },
        last_activity_at: row.session_updated_at,
        pending_permission,
        queued_approval_count: queued_approval_count(row.pending_approval_count),
        review_artifact_count,
        has_review_artifacts: review_artifact_count > 0,
        continuity: SessionContinuity::live(),
        continuable: true,
        view_only_reason: None,
    }
}

fn build_timeline(
    messages: &[Message],
    tool_calls: &[ToolCallRow],
    permission_rows: &[PermissionRequestRow],
    review_artifacts: &[ReviewArtifactSummary],
) -> anyhow::Result<Vec<TimelineItem>> {
    let mut items = Vec::new();

    for message in messages {
        items.push(TimelineSortItem {
            timestamp: message.created_at.clone(),
            item: TimelineItem::Message {
                id: message.id.clone(),
                session_id: message.session_id.clone(),
                timestamp: message.created_at.clone(),
                status: message.status.clone(),
                role: message.role.clone(),
                content: message.content.clone(),
            },
        });
    }

    for tool_call in tool_calls {
        let input: Value = serde_json::from_str(&tool_call.input_json)?;
        let output = tool_call
            .output_json
            .as_ref()
            .map(|value| serde_json::from_str(value))
            .transpose()?;
        let review_artifact_ids = review_artifacts
            .iter()
            .filter(|artifact| artifact.tool_call_id == tool_call.acp_tool_call_id)
            .map(|artifact| artifact.id.clone())
            .collect();
        items.push(TimelineSortItem {
            timestamp: tool_call.created_at.clone(),
            item: TimelineItem::ToolCall {
                id: tool_call.id.clone(),
                session_id: tool_call.session_id.clone(),
                timestamp: tool_call.created_at.clone(),
                status: tool_call.status.clone(),
                tool_call_id: tool_call.acp_tool_call_id.clone(),
                tool_kind: tool_call.kind.clone(),
                title: tool_call.title.clone(),
                summary: tool_call.summary.clone(),
                input,
                output,
                review_artifact_ids,
            },
        });
    }

    for permission in permission_rows {
        items.push(TimelineSortItem {
            timestamp: permission.created_at.clone(),
            item: TimelineItem::Permission {
                id: permission.id.clone(),
                session_id: permission.session_id.clone(),
                timestamp: permission.created_at.clone(),
                status: permission.status.clone(),
                tool_call_id: permission.tool_call_id.clone(),
                title: permission.title.clone(),
                permission_kind: permission.kind.clone(),
            },
        });
    }

    for artifact in review_artifacts {
        items.push(TimelineSortItem {
            timestamp: artifact.created_at.clone(),
            item: TimelineItem::ReviewArtifact {
                id: artifact.id.clone(),
                session_id: artifact.session_id.clone(),
                timestamp: artifact.created_at.clone(),
                status: status::IDLE.to_string(),
                tool_call_id: artifact.tool_call_id.clone(),
                artifact_kind: artifact.kind.clone(),
                title: artifact.title.clone(),
                summary: artifact.summary.clone(),
                source: artifact.source.clone(),
            },
        });
    }

    items.sort_by(|left, right| left.timestamp.cmp(&right.timestamp));
    Ok(items.into_iter().map(|entry| entry.item).collect())
}

struct TimelineSortItem {
    timestamp: String,
    item: TimelineItem,
}

pub fn parse_permission_options(options_json: &Value) -> Vec<PermissionOption> {
    options_json
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|option| {
            let option_id = option
                .get("optionId")
                .or_else(|| option.get("id"))
                .and_then(Value::as_str)?
                .to_string();
            let kind = option
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or(&option_id)
                .to_string();
            let name = option
                .get("name")
                .or_else(|| option.get("label"))
                .and_then(Value::as_str)
                .unwrap_or(&kind)
                .to_string();

            Some(PermissionOption {
                option_id,
                name,
                kind,
            })
        })
        .collect()
}

fn sqlite_file_path(database_url: &str) -> Option<PathBuf> {
    let rest = database_url.strip_prefix("sqlite://")?;
    let path = rest.split('?').next().unwrap_or(rest);
    if path == ":memory:" || path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::review_artifact_kind;

    async fn create_test_permission(
        storage: &Storage,
        session_id: &str,
        acp_session_id: &str,
        acp_request_id: &str,
        title: &str,
    ) -> PermissionRequest {
        storage
            .create_permission_request(NewPermissionRequest {
                session_id: session_id.to_string(),
                acp_session_id: acp_session_id.to_string(),
                acp_request_id: acp_request_id.to_string(),
                tool_call_id: Some(format!("tool-{acp_request_id}")),
                title: title.to_string(),
                kind: "execute".to_string(),
                tool_call_json: serde_json::json!({
                    "toolCallId": format!("tool-{acp_request_id}"),
                    "title": title,
                    "kind": "execute"
                }),
                options_json: serde_json::json!([
                    {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                    {"optionId": "reject-once", "name": "Reject", "kind": "reject_once"}
                ]),
            })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn stores_workspace_session_and_messages() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();

        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();

        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        storage
            .create_message(&session.id, role::USER, "Hello", status::IDLE)
            .await
            .unwrap();
        storage
            .create_message(&session.id, role::ASSISTANT, "Hi", status::IDLE)
            .await
            .unwrap();

        let detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(detail.workspace.name, "Test");
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].content, "Hello");
        assert_eq!(detail.messages[1].content, "Hi");
    }

    #[tokio::test]
    async fn create_workspace_is_idempotent_for_existing_path() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();

        let first = storage
            .create_workspace(dir.path().to_string_lossy(), Some("First".to_string()))
            .await
            .unwrap();
        let second = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Second".to_string()))
            .await
            .unwrap();

        assert_eq!(second.id, first.id);
        assert_eq!(second.name, "First");
        assert_eq!(storage.list_workspaces().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn stores_resolves_and_expires_permission_requests() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        let permission = storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id.clone(),
                acp_session_id: "acp-session-1".to_string(),
                acp_request_id: "7".to_string(),
                tool_call_id: Some("tool-1".to_string()),
                title: "Run command".to_string(),
                kind: "execute".to_string(),
                tool_call_json: serde_json::json!({
                    "toolCallId": "tool-1",
                    "title": "Run command",
                    "kind": "execute"
                }),
                options_json: serde_json::json!([
                    {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                    {"optionId": "reject-once", "name": "Reject", "kind": "reject_once"},
                    {"optionId": "allow-always", "name": "Allow always", "kind": "allow_always"}
                ]),
            })
            .await
            .unwrap();

        assert_eq!(permission.status, permission_status::PENDING);
        assert_eq!(permission.options.len(), 3);
        assert_eq!(
            storage.get_session(&session.id).await.unwrap().status,
            status::WAITING_APPROVAL
        );
        assert_eq!(storage.list_inbox_items().await.unwrap().len(), 1);

        storage
            .resolve_permission_request(&permission.id, "reject-once")
            .await
            .unwrap();
        let resolved = storage
            .get_permission_request(&permission.id)
            .await
            .unwrap();
        assert_eq!(resolved.status, permission_status::SELECTED);
        assert_eq!(resolved.selected_option_id.as_deref(), Some("reject-once"));

        let second = storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id.clone(),
                acp_session_id: "acp-session-1".to_string(),
                acp_request_id: "8".to_string(),
                tool_call_id: Some("tool-2".to_string()),
                title: "Edit file".to_string(),
                kind: "edit".to_string(),
                tool_call_json: serde_json::json!({"toolCallId": "tool-2"}),
                options_json: serde_json::json!([
                    {"optionId": "reject-once", "name": "Reject", "kind": "reject_once"}
                ]),
            })
            .await
            .unwrap();

        let expired = storage
            .expire_pending_permission_requests_on_startup()
            .await
            .unwrap();
        assert_eq!(expired, 1);
        let expired_request = storage.get_permission_request(&second.id).await.unwrap();
        assert_eq!(expired_request.status, permission_status::EXPIRED);
        assert_eq!(
            storage.get_session(&session.id).await.unwrap().status,
            status::FAILED
        );
        assert!(storage
            .session_detail(&session.id)
            .await
            .unwrap()
            .failure_message
            .unwrap()
            .contains("backend restarted"));
    }

    #[tokio::test]
    async fn normalizes_waiting_approval_when_pending_permission_exists() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id.clone(),
                acp_session_id: "acp-session-1".to_string(),
                acp_request_id: "7".to_string(),
                tool_call_id: Some("tool-1".to_string()),
                title: "Run command".to_string(),
                kind: "execute".to_string(),
                tool_call_json: serde_json::json!({"toolCallId": "tool-1"}),
                options_json: serde_json::json!([
                    {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"}
                ]),
            })
            .await
            .unwrap();
        storage
            .update_session_status(&session.id, status::IDLE)
            .await
            .unwrap();

        let detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(detail.session.status, status::WAITING_APPROVAL);

        let list_item = storage
            .list_session_items()
            .await
            .unwrap()
            .into_iter()
            .find(|item| item.session.id == session.id)
            .unwrap();
        assert_eq!(list_item.session.status, status::WAITING_APPROVAL);

        let inbox_item = storage
            .list_inbox_items()
            .await
            .unwrap()
            .into_iter()
            .find(|item| item.session.id == session.id)
            .unwrap();
        assert_eq!(inbox_item.session.status, status::WAITING_APPROVAL);
    }

    #[tokio::test]
    async fn restore_success_marks_restored_session_idle() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        storage
            .update_session_status(&session.id, status::RUNNING)
            .await
            .unwrap();
        storage
            .mark_session_restore_started(&session.id)
            .await
            .unwrap();
        storage
            .mark_session_restore_succeeded(&session.id)
            .await
            .unwrap();

        let restored = storage.get_session(&session.id).await.unwrap();
        let continuity = storage.session_continuity_row(&session.id).await.unwrap();
        let detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(restored.status, status::IDLE);
        assert_eq!(detail.session.status, status::IDLE);
        assert_eq!(detail.queued_approval_count, 0);
        assert_eq!(continuity.continuation_state, continuity_state::RESTORED);
        assert!(continuity.restore_completed_at.is_some());
    }

    #[tokio::test]
    async fn startup_repair_marks_restored_running_sessions_idle() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        storage
            .mark_session_restore_succeeded(&session.id)
            .await
            .unwrap();
        storage
            .update_session_status(&session.id, status::RUNNING)
            .await
            .unwrap();

        let repaired = storage
            .repair_restored_running_sessions_on_startup()
            .await
            .unwrap();

        assert_eq!(repaired, 1);
        assert_eq!(
            storage.get_session(&session.id).await.unwrap().status,
            status::IDLE
        );
    }

    #[tokio::test]
    async fn queues_multiple_pending_permissions_per_session() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        let first = create_test_permission(
            &storage,
            &session.id,
            "acp-session-1",
            "permission-1",
            "First approval",
        )
        .await;
        let second = create_test_permission(
            &storage,
            &session.id,
            "acp-session-1",
            "permission-2",
            "Second approval",
        )
        .await;

        let pending = storage
            .pending_permissions_for_session(&session.id)
            .await
            .unwrap();
        assert_eq!(pending.len(), 2);
        assert_eq!(pending[0].id, first.id);
        assert_eq!(pending[1].id, second.id);

        let detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(detail.pending_permission.as_ref().unwrap().id, first.id);
        assert_eq!(detail.pending_permissions.len(), 2);
        assert_eq!(detail.pending_approval_count, 2);
        assert_eq!(detail.queued_approval_count, 1);
        assert_eq!(detail.session.status, status::WAITING_APPROVAL);

        let inbox = storage.list_inbox_items().await.unwrap();
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].permission.id, first.id);
        assert_eq!(inbox[0].queued_approval_count, 1);

        let list_item = storage
            .list_session_items()
            .await
            .unwrap()
            .into_iter()
            .find(|item| item.session.id == session.id)
            .unwrap();
        assert_eq!(list_item.pending_permission.as_ref().unwrap().id, first.id);
        assert_eq!(list_item.queued_approval_count, 1);
    }

    #[tokio::test]
    async fn stores_and_scopes_review_artifacts() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();
        let other_session = storage
            .create_session(&workspace.id, "acp-session-2".to_string())
            .await
            .unwrap();

        let artifact = storage
            .create_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: "tool_call".to_string(),
                title: "Run command".to_string(),
                summary: "execute completed".to_string(),
                payload: serde_json::json!({"toolCallId": "tool-1", "status": "completed"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();

        let summaries = storage
            .list_review_artifact_summaries(&session.id)
            .await
            .unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].tool_call_id.as_deref(), Some("tool-1"));

        let detail = storage
            .get_review_artifact_for_session(&session.id, &artifact.id)
            .await
            .unwrap();
        assert_eq!(detail.payload["status"], "completed");

        assert!(storage
            .get_review_artifact_for_session(&other_session.id, &artifact.id)
            .await
            .is_err());

        let session_detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(session_detail.review_artifacts.len(), 1);
    }

    #[tokio::test]
    async fn upserts_review_artifacts_for_same_tool_call_evidence() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        let first = storage
            .upsert_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: review_artifact_kind::TERMINAL.to_string(),
                title: "Run command".to_string(),
                summary: "execute running".to_string(),
                payload: serde_json::json!({"output": "first"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();
        assert!(first.created);

        let second = storage
            .upsert_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: review_artifact_kind::TERMINAL.to_string(),
                title: "Run command".to_string(),
                summary: "execute completed".to_string(),
                payload: serde_json::json!({"output": "second"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();
        assert!(!second.created);
        assert_eq!(second.artifact.id, first.artifact.id);
        assert_eq!(second.artifact.summary, "execute completed");
        assert_eq!(second.artifact.payload["output"], "second");
        assert_eq!(
            storage
                .list_review_artifact_summaries(&session.id)
                .await
                .unwrap()
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn hides_historical_duplicate_review_artifacts_for_same_tool_call() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        storage
            .create_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: review_artifact_kind::TERMINAL.to_string(),
                title: "Run command".to_string(),
                summary: "execute running".to_string(),
                payload: serde_json::json!({"output": "first"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();
        storage
            .create_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: review_artifact_kind::TERMINAL.to_string(),
                title: "Run command".to_string(),
                summary: "execute completed".to_string(),
                payload: serde_json::json!({"output": "second"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();

        let summaries = storage
            .list_review_artifact_summaries(&session.id)
            .await
            .unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].summary, "execute completed");

        let items = storage.list_session_items().await.unwrap();
        assert_eq!(items[0].review_artifact_count, 1);
    }

    #[tokio::test]
    async fn lists_session_items_with_projection_metadata() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let first = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();
        let second = storage
            .create_session(&workspace.id, "acp-session-2".to_string())
            .await
            .unwrap();

        storage
            .create_review_artifact(NewReviewArtifact {
                session_id: second.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: "tool_call".to_string(),
                title: "Run command".to_string(),
                summary: "execute completed".to_string(),
                payload: serde_json::json!({"toolCallId": "tool-1"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();
        storage
            .create_permission_request(NewPermissionRequest {
                session_id: second.id.clone(),
                acp_session_id: "acp-session-2".to_string(),
                acp_request_id: "7".to_string(),
                tool_call_id: Some("tool-2".to_string()),
                title: "Approve write".to_string(),
                kind: "edit".to_string(),
                tool_call_json: serde_json::json!({"toolCallId": "tool-2"}),
                options_json: serde_json::json!([
                    {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"}
                ]),
            })
            .await
            .unwrap();

        let items = storage.list_session_items().await.unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].session.id, second.id);
        assert_eq!(items[0].workspace.name, "Test");
        assert_eq!(items[0].last_activity_at, items[0].session.updated_at);
        assert_eq!(
            items[0].pending_permission.as_ref().unwrap().title,
            "Approve write"
        );
        assert_eq!(items[0].review_artifact_count, 1);
        assert!(items[0].has_review_artifacts);
        assert_eq!(items[1].session.id, first.id);
        assert!(items[1].pending_permission.is_none());
    }

    #[tokio::test]
    async fn session_detail_returns_normalized_timeline_with_tool_links() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();

        storage
            .create_message(&session.id, role::USER, "Hello", status::IDLE)
            .await
            .unwrap();
        let tool_call = storage
            .upsert_tool_call(UpsertToolCall {
                session_id: session.id.clone(),
                acp_tool_call_id: Some("tool-1".to_string()),
                kind: "execute".to_string(),
                title: "Run tests".to_string(),
                summary: "execute running".to_string(),
                status: tool_call_status::RUNNING.to_string(),
                input: serde_json::json!({"toolCallId": "tool-1", "title": "Run tests"}),
                output: None,
            })
            .await
            .unwrap();
        storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id.clone(),
                acp_session_id: "acp-session-1".to_string(),
                acp_request_id: "7".to_string(),
                tool_call_id: Some("tool-1".to_string()),
                title: "Approve tests".to_string(),
                kind: "execute".to_string(),
                tool_call_json: serde_json::json!({"toolCallId": "tool-1"}),
                options_json: serde_json::json!([
                    {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"}
                ]),
            })
            .await
            .unwrap();
        let artifact = storage
            .create_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: review_artifact_kind::TERMINAL.to_string(),
                title: "Test output".to_string(),
                summary: "tests passed".to_string(),
                payload: serde_json::json!({"output": "ok"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();

        let detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(detail.timeline.len(), 4);
        assert!(matches!(detail.timeline[0], TimelineItem::Message { .. }));
        let tool_item = detail
            .timeline
            .iter()
            .find_map(|item| match item {
                TimelineItem::ToolCall {
                    id,
                    review_artifact_ids,
                    ..
                } => Some((id, review_artifact_ids)),
                _ => None,
            })
            .unwrap();
        assert_eq!(tool_item.0, &tool_call.id);
        assert_eq!(tool_item.1, &vec![artifact.id]);
        assert!(detail
            .timeline
            .iter()
            .any(|item| matches!(item, TimelineItem::Permission { .. })));
        assert!(detail
            .timeline
            .iter()
            .any(|item| matches!(item, TimelineItem::ReviewArtifact { .. })));
    }

    #[tokio::test]
    async fn lists_session_items_for_one_workspace() {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        let first_dir = tempfile::tempdir().unwrap();
        let second_dir = tempfile::tempdir().unwrap();
        let first_workspace = storage
            .create_workspace(
                first_dir.path().to_string_lossy(),
                Some("First".to_string()),
            )
            .await
            .unwrap();
        let second_workspace = storage
            .create_workspace(
                second_dir.path().to_string_lossy(),
                Some("Second".to_string()),
            )
            .await
            .unwrap();
        let first_session = storage
            .create_session(&first_workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();
        storage
            .create_session(&second_workspace.id, "acp-session-2".to_string())
            .await
            .unwrap();

        let items = storage
            .list_session_items_for_workspace(&first_workspace.id)
            .await
            .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].session.id, first_session.id);
        assert_eq!(items[0].workspace.id, first_workspace.id);

        assert!(storage
            .list_session_items_for_workspace("missing-workspace")
            .await
            .is_err());
    }
}
