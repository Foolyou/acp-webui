use std::{path::PathBuf, str::FromStr};

use anyhow::Context;
use chrono::Utc;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use uuid::Uuid;

use crate::models::{role, status, Message, Session, SessionDetail, Workspace};

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

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> anyhow::Result<()> {
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        Ok(())
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

        Ok(SessionDetail {
            session,
            workspace,
            messages,
        })
    }

    pub async fn add_system_message(&self, session_id: &str, content: &str) -> anyhow::Result<()> {
        self.create_message(session_id, role::SYSTEM, content, status::IDLE)
            .await?;
        Ok(())
    }
}

fn now() -> String {
    Utc::now().to_rfc3339()
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
}
