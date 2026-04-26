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
use serde::Serialize;
use tokio::sync::broadcast;
use tower_http::services::ServeDir;

use crate::{
    acp::{CodexRuntime, ConnectionStatus, RealtimeEvent},
    error::{AppError, AppResult},
    models::{
        role, status, CreateWorkspaceRequest, InboxItem, Message, PermissionRequest, PromptRequest,
        ResolvePermissionRequest, SessionDetail, Workspace,
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
            post(create_session),
        )
        .route("/api/sessions/{session_id}", get(get_session))
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
        .session_detail(&session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    Ok(Json(detail))
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
                if let Err(error) = storage
                    .create_message(&session_id, role::ASSISTANT, &outcome.content, status::IDLE)
                    .await
                {
                    tracing::error!(?error, "failed to persist assistant message");
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

#[cfg(test)]
mod tests {
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use serde_json::Value;
    use tower::ServiceExt;

    use super::*;
    use crate::{config::Config, storage::NewPermissionRequest};

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
