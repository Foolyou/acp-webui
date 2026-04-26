use std::{path::PathBuf, str::FromStr};

use anyhow::Context;
use chrono::Utc;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use uuid::Uuid;

use serde_json::Value;

use crate::models::{
    permission_status, role, status, InboxItem, Message, PermissionOption, PermissionRequest,
    PermissionRequestRow, Session, SessionDetail, Workspace,
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
        for request in &pending {
            self.expire_permission_request(&request.id, APPROVAL_EXPIRED_MESSAGE)
                .await?;
            self.update_session_status(&request.session_id, status::FAILED)
                .await?;
            self.add_system_message(&request.session_id, APPROVAL_EXPIRED_MESSAGE)
                .await?;
        }
        Ok(pending.len())
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
            INSERT INTO workspaces (id, name, path, created_at)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&name)
        .bind(&path)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get_workspace(&id).await
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
                status,
                created_at,
                updated_at
            )
            VALUES (?, ?, 'codex', ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(workspace_id)
        .bind(acp_session_id)
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
            SELECT id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at
            FROM sessions
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(session)
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

    pub async fn session_detail(&self, session_id: &str) -> anyhow::Result<SessionDetail> {
        let session = self.get_session(session_id).await?;
        let workspace = self.get_workspace(&session.workspace_id).await?;
        let messages = self.list_messages(&session.id).await?;
        let pending_permission = self.pending_permission_for_session(&session.id).await?;
        let failure_message = self
            .latest_permission_failure_for_session(&session.id)
            .await?;

        Ok(SessionDetail {
            session,
            workspace,
            messages,
            pending_permission,
            failure_message,
        })
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
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(session_id)
        .bind(permission_status::PENDING)
        .fetch_optional(&self.pool)
        .await?;

        row.map(row_to_permission_request).transpose()
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
            ORDER BY created_at ASC
            "#,
        )
        .bind(permission_status::PENDING)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn list_inbox_items(&self) -> anyhow::Result<Vec<InboxItem>> {
        let rows = self.list_pending_permission_request_rows().await?;
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            let session = self.get_session(&row.session_id).await?;
            let workspace = self.get_workspace(&session.workspace_id).await?;
            let permission = row_to_permission_request(row)?;
            items.push(InboxItem {
                session,
                workspace,
                permission,
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
}
