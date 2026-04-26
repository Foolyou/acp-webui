use std::{path::PathBuf, sync::Arc};

use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Serialize;
use serde_json::json;
use tokio::process::Command;
use tokio::sync::broadcast;
use tower_http::services::ServeDir;

use crate::{
    acp::{CodexRuntime, ConnectionStatus, RealtimeEvent},
    error::{AppError, AppResult},
    models::{
        review_artifact_kind, role, status, CreateWorkspaceRequest, DiffFallbackResponse,
        InboxItem, Message, PermissionRequest, PromptRequest, ResolvePermissionRequest,
        ReviewArtifact, ReviewArtifactSummary, SessionDetail, SessionListItem, TimelineItem,
        Workspace,
    },
    storage::Storage,
};

#[derive(Clone)]
pub struct AppState {
    pub storage: Storage,
    pub codex: Arc<CodexRuntime>,
    pub events_tx: broadcast::Sender<RealtimeEvent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStateResponse {
    codex: ConnectionStatus,
    inbox: Vec<InboxItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptAcceptedResponse {
    message: Message,
}

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/api/app-state", get(app_state))
        .route("/api/inbox", get(inbox))
        .route(
            "/api/workspaces",
            get(list_workspaces).post(create_workspace),
        )
        .route(
            "/api/workspaces/{workspace_id}/sessions",
            get(list_workspace_sessions).post(create_session),
        )
        .route("/api/sessions", get(list_sessions))
        .route("/api/sessions/{session_id}", get(get_session))
        .route(
            "/api/sessions/{session_id}/review-artifacts",
            get(list_review_artifacts),
        )
        .route(
            "/api/sessions/{session_id}/review-artifacts/{artifact_id}",
            get(get_review_artifact),
        )
        .route("/api/sessions/{session_id}/review-diff", get(review_diff))
        .route("/api/sessions/{session_id}/prompt", post(submit_prompt))
        .route("/api/sessions/{session_id}/cancel", post(cancel_session))
        .route(
            "/api/permission-requests/{permission_id}/resolve",
            post(resolve_permission),
        )
        .route("/api/ws", get(websocket))
}

pub fn frontend_service(frontend_dist: &PathBuf) -> ServeDir {
    ServeDir::new(frontend_dist)
}

async fn app_state(State(state): State<AppState>) -> AppResult<Json<AppStateResponse>> {
    let inbox = state.storage.list_inbox_items().await?;
    Ok(Json(AppStateResponse {
        codex: state.codex.status().await,
        inbox,
    }))
}

async fn inbox(State(state): State<AppState>) -> AppResult<Json<Vec<InboxItem>>> {
    Ok(Json(state.storage.list_inbox_items().await?))
}

async fn list_sessions(State(state): State<AppState>) -> AppResult<Json<Vec<SessionListItem>>> {
    let items = state.storage.list_session_items().await?;
    Ok(Json(apply_session_list_continuity(&state, items).await))
}

async fn list_workspace_sessions(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<Vec<SessionListItem>>> {
    let items = state
        .storage
        .list_session_items_for_workspace(&workspace_id)
        .await
        .map_err(|_| AppError::NotFound("Workspace not found".to_string()))?;
    Ok(Json(apply_session_list_continuity(&state, items).await))
}

async fn list_workspaces(State(state): State<AppState>) -> AppResult<Json<Vec<Workspace>>> {
    let workspaces = state.storage.list_workspaces().await?;
    Ok(Json(workspaces))
}

async fn create_workspace(
    State(state): State<AppState>,
    Json(payload): Json<CreateWorkspaceRequest>,
) -> AppResult<Json<Workspace>> {
    let path = payload.path.trim();
    if path.is_empty() {
        return Err(AppError::BadRequest(
            "Workspace path is required".to_string(),
        ));
    }
    if !std::path::Path::new(path).is_dir() {
        return Err(AppError::BadRequest(
            "Workspace path must be an accessible directory".to_string(),
        ));
    }

    let workspace = state
        .storage
        .create_workspace(path, payload.name)
        .await
        .map_err(AppError::Other)?;

    Ok(Json(workspace))
}

async fn create_session(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<SessionDetail>> {
    let workspace = state
        .storage
        .get_workspace(&workspace_id)
        .await
        .map_err(|_| AppError::NotFound("Workspace not found".to_string()))?;

    let acp_session_id = state
        .codex
        .new_session(workspace.path.clone())
        .await
        .map_err(|error| AppError::ServiceUnavailable(error.to_string()))?;

    let session = state
        .storage
        .create_session(&workspace.id, acp_session_id.clone())
        .await
        .map_err(AppError::Other)?;
    state
        .codex
        .register_session(acp_session_id, session.id.clone())
        .await;

    let detail = state.storage.session_detail(&session.id).await?;
    Ok(Json(detail))
}

async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> AppResult<Json<SessionDetail>> {
    let detail = state
        .storage
        .session_detail_with_continuity(
            &session_id,
            state.session_is_continuable_by_id(&session_id).await?,
            state.view_only_reason_for_session_id(&session_id).await?,
        )
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    Ok(Json(detail))
}

async fn list_review_artifacts(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> AppResult<Json<Vec<ReviewArtifactSummary>>> {
    state
        .storage
        .get_session(&session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    Ok(Json(
        state
            .storage
            .list_review_artifact_summaries(&session_id)
            .await?,
    ))
}

async fn get_review_artifact(
    State(state): State<AppState>,
    Path((session_id, artifact_id)): Path<(String, String)>,
) -> AppResult<Json<ReviewArtifact>> {
    let artifact = state
        .storage
        .get_review_artifact_for_session(&session_id, &artifact_id)
        .await
        .map_err(|_| AppError::NotFound("Review artifact not found".to_string()))?;
    Ok(Json(artifact))
}

async fn review_diff(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> AppResult<Json<DiffFallbackResponse>> {
    let session = state
        .storage
        .get_session(&session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    let workspace = state.storage.get_workspace(&session.workspace_id).await?;
    let output = Command::new("git")
        .args(["diff", "--no-ext-diff"])
        .current_dir(&workspace.path)
        .output()
        .await
        .map_err(|error| {
            AppError::ServiceUnavailable(format!("Failed to run git diff: {error}"))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::ServiceUnavailable(if stderr.is_empty() {
            "git diff failed for this workspace".to_string()
        } else {
            stderr
        }));
    }

    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let summary = summarize_diff(&diff);
    let artifact = ReviewArtifact {
        id: format!("diff-fallback-{session_id}"),
        session_id,
        tool_call_id: None,
        kind: review_artifact_kind::DIFF.to_string(),
        title: "Workspace diff".to_string(),
        summary,
        payload: json!({
            "format": "unified_diff",
            "diff": diff,
            "source": "git diff --no-ext-diff"
        }),
        source: "git_diff".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };

    Ok(Json(DiffFallbackResponse { artifact }))
}

async fn submit_prompt(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(payload): Json<PromptRequest>,
) -> AppResult<Json<PromptAcceptedResponse>> {
    let prompt = payload.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err(AppError::BadRequest("Prompt cannot be empty".to_string()));
    }

    let session = state
        .storage
        .get_session(&session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if session.status == status::RUNNING || session.status == status::WAITING_APPROVAL {
        let message = if session.status == status::WAITING_APPROVAL {
            "This session is waiting for approval. Resolve the pending approval before sending another prompt."
        } else {
            "This session is already running. Wait for it to finish before sending another prompt."
        };
        return Err(AppError::Conflict(message.to_string()));
    }

    if !state
        .codex
        .has_registered_session(session.acp_session_id.as_deref())
        .await
    {
        return Err(AppError::Conflict(view_only_reason().to_string()));
    }

    let Some(acp_session_id) = session.acp_session_id.clone() else {
        return Err(AppError::Conflict(
            "Session is missing an ACP session id".to_string(),
        ));
    };

    let message = state
        .storage
        .create_message(&session.id, role::USER, &prompt, status::IDLE)
        .await
        .map_err(AppError::Other)?;
    state
        .storage
        .update_session_status(&session.id, status::RUNNING)
        .await?;
    let _ = state.events_tx.send(RealtimeEvent::SessionStatus {
        session_id: session.id.clone(),
        status: status::RUNNING.to_string(),
    });

    tokio::spawn(run_prompt_turn(
        state.storage.clone(),
        state.codex.clone(),
        state.events_tx.clone(),
        session.id.clone(),
        acp_session_id,
        prompt,
    ));

    Ok(Json(PromptAcceptedResponse { message }))
}

impl AppState {
    async fn session_is_continuable_by_id(&self, session_id: &str) -> AppResult<bool> {
        let session = self
            .storage
            .get_session(session_id)
            .await
            .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
        Ok(self
            .codex
            .has_registered_session(session.acp_session_id.as_deref())
            .await)
    }

    async fn view_only_reason_for_session_id(&self, session_id: &str) -> AppResult<Option<String>> {
        if self.session_is_continuable_by_id(session_id).await? {
            Ok(None)
        } else {
            Ok(Some(view_only_reason().to_string()))
        }
    }
}

async fn apply_session_list_continuity(
    state: &AppState,
    items: Vec<SessionListItem>,
) -> Vec<SessionListItem> {
    let mut updated = Vec::with_capacity(items.len());
    for mut item in items {
        let continuable = state
            .codex
            .has_registered_session(item.session.acp_session_id.as_deref())
            .await;
        item.continuable = continuable;
        item.view_only_reason = if continuable {
            None
        } else {
            Some(view_only_reason().to_string())
        };
        updated.push(item);
    }
    updated
}

fn view_only_reason() -> &'static str {
    "This session history is available for review, but the live Codex runtime context is not available. Start a new session to continue working."
}

async fn resolve_permission(
    State(state): State<AppState>,
    Path(permission_id): Path<String>,
    Json(payload): Json<ResolvePermissionRequest>,
) -> AppResult<Json<PermissionRequest>> {
    let option_id = payload.option_id.trim();
    if option_id.is_empty() {
        return Err(AppError::BadRequest(
            "Permission option id is required".to_string(),
        ));
    }

    let permission = state
        .codex
        .resolve_permission(&permission_id, option_id)
        .await
        .map_err(|error| AppError::Conflict(error.to_string()))?;
    Ok(Json(permission))
}

async fn cancel_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> AppResult<Json<SessionDetail>> {
    let session = state
        .storage
        .get_session(&session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if session.status != status::WAITING_APPROVAL {
        return Err(AppError::Conflict(
            "Only sessions waiting for approval can be cancelled in this version.".to_string(),
        ));
    }

    state
        .codex
        .cancel_pending_permission_for_session(&session_id)
        .await
        .map_err(|error| AppError::Conflict(error.to_string()))?;
    state
        .storage
        .update_session_status(&session_id, status::FAILED)
        .await?;
    let text = "Turn cancelled while waiting for approval.";
    state.storage.add_system_message(&session_id, text).await?;
    let _ = state.events_tx.send(RealtimeEvent::SessionStatus {
        session_id: session_id.clone(),
        status: status::FAILED.to_string(),
    });

    Ok(Json(state.storage.session_detail(&session_id).await?))
}

async fn run_prompt_turn(
    storage: Storage,
    codex: Arc<CodexRuntime>,
    events_tx: broadcast::Sender<RealtimeEvent>,
    session_id: String,
    acp_session_id: String,
    prompt: String,
) {
    match codex.prompt(acp_session_id, prompt).await {
        Ok(outcome) => {
            match storage.get_session(&session_id).await {
                Ok(session) if session.status == status::FAILED => {
                    tracing::debug!(session_id, "prompt turn finished after session failed");
                    return;
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::error!(?error, "failed to inspect session before completion");
                }
            }
            if !outcome.content.is_empty() {
                match storage
                    .create_message(&session_id, role::ASSISTANT, &outcome.content, status::IDLE)
                    .await
                {
                    Ok(message) => {
                        let _ = events_tx.send(RealtimeEvent::TimelineItemUpsert {
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
                    Err(error) => {
                        tracing::error!(?error, "failed to persist assistant message");
                    }
                }
                let _ = events_tx.send(RealtimeEvent::AssistantMessage {
                    session_id: session_id.clone(),
                    content: outcome.content,
                });
            }
            if let Err(error) = storage
                .update_session_status(&session_id, status::IDLE)
                .await
            {
                tracing::error!(?error, "failed to mark session idle");
            }
            let _ = events_tx.send(RealtimeEvent::SessionStatus {
                session_id,
                status: status::IDLE.to_string(),
            });
        }
        Err(error) => {
            tracing::error!(?error, "prompt turn failed");
            let text = format!("Prompt failed: {error}");
            if let Err(error) = storage
                .update_session_status(&session_id, status::FAILED)
                .await
            {
                tracing::error!(?error, "failed to mark session failed");
            }
            if let Err(error) = storage.add_system_message(&session_id, &text).await {
                tracing::error!(?error, "failed to persist prompt failure");
            }
            let _ = events_tx.send(RealtimeEvent::Error { message: text });
            let _ = events_tx.send(RealtimeEvent::SessionStatus {
                session_id,
                status: status::FAILED.to_string(),
            });
        }
    }
}

async fn websocket(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| websocket_loop(socket, state))
}

async fn websocket_loop(mut socket: WebSocket, state: AppState) {
    let mut rx = state.events_tx.subscribe();

    let initial = RealtimeEvent::ConnectionStatus {
        status: state.codex.status().await,
    };
    if send_ws_event(&mut socket, &initial).await.is_err() {
        return;
    }

    loop {
        match rx.recv().await {
            Ok(event) => {
                if send_ws_event(&mut socket, &event).await.is_err() {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(skipped)) => {
                let event = RealtimeEvent::Error {
                    message: format!("Realtime channel skipped {skipped} stale events; reload session history if content looks incomplete."),
                };
                if send_ws_event(&mut socket, &event).await.is_err() {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}

async fn send_ws_event(socket: &mut WebSocket, event: &RealtimeEvent) -> anyhow::Result<()> {
    let text = serde_json::to_string(event)?;
    socket.send(WsMessage::Text(text.into())).await?;
    Ok(())
}

fn summarize_diff(diff: &str) -> String {
    if diff.trim().is_empty() {
        return "No workspace changes".to_string();
    }
    let files = diff
        .lines()
        .filter(|line| line.starts_with("diff --git "))
        .count();
    let additions = diff
        .lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .count();
    let deletions = diff
        .lines()
        .filter(|line| line.starts_with('-') && !line.starts_with("---"))
        .count();
    format!("{files} files changed, +{additions} -{deletions}")
}

#[cfg(test)]
mod tests {
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use serde_json::Value;
    use tower::ServiceExt;

    use super::*;
    use std::process::Command as StdCommand;

    use crate::{config::Config, models::NewReviewArtifact, storage::NewPermissionRequest};

    async fn test_state() -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let database_url = format!("sqlite://{}", dir.path().join("test.db").display());
        let storage = Storage::connect(&database_url).await.unwrap();
        storage.migrate().await.unwrap();
        let (events_tx, _) = broadcast::channel(16);
        let config = Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            database_url,
            codex_acp_command: "codex-acp".to_string(),
            codex_acp_args: vec![],
            frontend_dist: dir.path().join("dist"),
        };
        let codex = CodexRuntime::failed_for_tests(config, storage.clone(), events_tx.clone());

        (
            AppState {
                storage,
                codex,
                events_tx,
            },
            dir,
        )
    }

    #[tokio::test]
    async fn app_state_reports_codex_status() {
        let (state, _dir) = test_state().await;
        let app = api_router().with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/app-state")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["codex"]["state"], "failed");
    }

    #[tokio::test]
    async fn workspace_endpoints_create_and_list_workspaces() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let app = api_router().with_state(state);

        let body = serde_json::json!({
            "path": workspace_dir.path().to_string_lossy()
        });
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/workspaces")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let created_body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let created: Value = serde_json::from_slice(&created_body).unwrap();
        assert_eq!(
            created["path"].as_str().unwrap(),
            workspace_dir
                .path()
                .canonicalize()
                .unwrap()
                .to_string_lossy()
        );

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/workspaces")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let list_body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let list: Value = serde_json::from_slice(&list_body).unwrap();
        assert_eq!(list.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn inbox_projection_includes_pending_permission() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        state
            .storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id,
                acp_session_id: "acp-session".to_string(),
                acp_request_id: "1".to_string(),
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
        let app = api_router().with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/inbox")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json.as_array().unwrap().len(), 1);
        assert_eq!(json[0]["permission"]["title"], "Run command");
    }

    #[tokio::test]
    async fn sessions_endpoint_returns_compact_projection() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        state
            .storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id.clone(),
                acp_session_id: "acp-session".to_string(),
                acp_request_id: "1".to_string(),
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
        state
            .storage
            .create_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-review".to_string()),
                kind: review_artifact_kind::TOOL_CALL.to_string(),
                title: "Inspect review evidence".to_string(),
                summary: "Review evidence available".to_string(),
                payload: serde_json::json!({"toolCallId": "tool-review"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();
        let app = api_router().with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/sessions")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json.as_array().unwrap().len(), 1);
        assert_eq!(json[0]["session"]["id"], session.id);
        assert_eq!(json[0]["workspace"]["id"], workspace.id);
        assert_eq!(json[0]["pendingPermission"]["title"], "Run command");
        assert_eq!(json[0]["reviewArtifactCount"], 1);
        assert_eq!(json[0]["hasReviewArtifacts"], true);
        assert!(json[0].get("messages").is_none());
    }

    #[tokio::test]
    async fn workspace_sessions_endpoint_filters_by_workspace() {
        let (state, _db_dir) = test_state().await;
        let first_dir = tempfile::tempdir().unwrap();
        let second_dir = tempfile::tempdir().unwrap();
        let first_workspace = state
            .storage
            .create_workspace(
                first_dir.path().to_string_lossy(),
                Some("First".to_string()),
            )
            .await
            .unwrap();
        let second_workspace = state
            .storage
            .create_workspace(
                second_dir.path().to_string_lossy(),
                Some("Second".to_string()),
            )
            .await
            .unwrap();
        let first_session = state
            .storage
            .create_session(&first_workspace.id, "acp-session-1".to_string())
            .await
            .unwrap();
        state
            .storage
            .create_session(&second_workspace.id, "acp-session-2".to_string())
            .await
            .unwrap();
        let app = api_router().with_state(state);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/workspaces/{}/sessions", first_workspace.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json.as_array().unwrap().len(), 1);
        assert_eq!(json[0]["session"]["id"], first_session.id);
        assert_eq!(json[0]["workspace"]["id"], first_workspace.id);
        assert_eq!(json[0]["continuable"], false);
        assert!(json[0]["viewOnlyReason"]
            .as_str()
            .unwrap()
            .contains("review"));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/workspaces/missing-workspace/sessions")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn review_artifact_routes_are_session_scoped() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let other_session = state
            .storage
            .create_session(&workspace.id, "other-acp-session".to_string())
            .await
            .unwrap();
        let artifact = state
            .storage
            .create_review_artifact(NewReviewArtifact {
                session_id: session.id.clone(),
                tool_call_id: Some("tool-1".to_string()),
                kind: review_artifact_kind::TOOL_CALL.to_string(),
                title: "Run command".to_string(),
                summary: "execute completed".to_string(),
                payload: serde_json::json!({"status": "completed"}),
                source: "acp".to_string(),
            })
            .await
            .unwrap();
        let app = api_router().with_state(state);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/sessions/{}/review-artifacts", session.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json.as_array().unwrap().len(), 1);
        assert_eq!(json[0]["title"], "Run command");
        assert!(json[0].get("payload").is_none());

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/sessions/{}/review-artifacts/{}",
                        session.id, artifact.id
                    ))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["payload"]["status"], "completed");

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/sessions/{}/review-artifacts/{}",
                        other_session.id, artifact.id
                    ))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn review_diff_returns_workspace_git_diff() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        StdCommand::new("git")
            .args(["init"])
            .current_dir(workspace_dir.path())
            .output()
            .unwrap();
        std::fs::write(workspace_dir.path().join("note.txt"), "hello\n").unwrap();
        StdCommand::new("git")
            .args(["add", "note.txt"])
            .current_dir(workspace_dir.path())
            .output()
            .unwrap();
        StdCommand::new("git")
            .args([
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-m",
                "Initial",
            ])
            .current_dir(workspace_dir.path())
            .output()
            .unwrap();
        std::fs::write(workspace_dir.path().join("note.txt"), "hello\nreview\n").unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let app = api_router().with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/sessions/{}/review-diff", session.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["artifact"]["kind"], "diff");
        assert!(json["artifact"]["payload"]["diff"]
            .as_str()
            .unwrap()
            .contains("note.txt"));
    }

    #[tokio::test]
    async fn review_diff_reports_git_errors_without_changing_status() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let app = api_router().with_state(state.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/sessions/{}/review-diff", session.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            state.storage.get_session(&session.id).await.unwrap().status,
            status::IDLE
        );
    }

    #[tokio::test]
    async fn prompt_is_rejected_while_waiting_for_approval() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        state
            .storage
            .update_session_status(&session.id, status::WAITING_APPROVAL)
            .await
            .unwrap();
        let app = api_router().with_state(state);

        let body = serde_json::json!({"prompt": "second prompt"});
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/prompt", session.id))
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn prompt_is_rejected_for_non_continuable_session() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let app = api_router().with_state(state);

        let body = serde_json::json!({"prompt": "continue"});
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/prompt", session.id))
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert!(json["error"].as_str().unwrap().contains("runtime context"));
    }

    #[tokio::test]
    async fn resolve_rejects_disabled_always_option() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let permission = state
            .storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id,
                acp_session_id: "acp-session".to_string(),
                acp_request_id: "1".to_string(),
                tool_call_id: Some("tool-1".to_string()),
                title: "Run command".to_string(),
                kind: "execute".to_string(),
                tool_call_json: serde_json::json!({"toolCallId": "tool-1"}),
                options_json: serde_json::json!([
                    {"optionId": "allow-always", "name": "Allow always", "kind": "allow_always"}
                ]),
            })
            .await
            .unwrap();
        let app = api_router().with_state(state.clone());

        let body = serde_json::json!({"optionId": "allow-always"});
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/permission-requests/{}/resolve",
                        permission.id
                    ))
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        assert_eq!(
            state
                .storage
                .get_permission_request(&permission.id)
                .await
                .unwrap()
                .status,
            crate::models::permission_status::PENDING
        );
    }

    #[tokio::test]
    async fn resolve_rejects_stale_permission_request() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(workspace_dir.path().to_string_lossy(), None)
            .await
            .unwrap();
        let session = state
            .storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let permission = state
            .storage
            .create_permission_request(NewPermissionRequest {
                session_id: session.id,
                acp_session_id: "acp-session".to_string(),
                acp_request_id: "1".to_string(),
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
        state
            .storage
            .cancel_permission_request(&permission.id)
            .await
            .unwrap();
        let app = api_router().with_state(state);

        let body = serde_json::json!({"optionId": "allow-once"});
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/permission-requests/{}/resolve",
                        permission.id
                    ))
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
    }
}
