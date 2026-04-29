use std::{path::PathBuf, sync::Arc};

use axum::{
    extract::{
        connect_info::ConnectInfo,
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
        Extension, Path, Request, State,
    },
    http::{header::SET_COOKIE, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::IntoResponse,
    routing::{any, get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Serialize;
use serde_json::json;
use tokio::process::Command;
use tokio::sync::broadcast;
use tower_http::services::{ServeDir, ServeFile};

use crate::{
    acp::{AgentRuntimeManager, AgentRuntimeStatus, CodexRuntime, ConnectionStatus, RealtimeEvent},
    auth::{AuthService, AuthStatus},
    error::{AppError, AppResult},
    models::{
        continuity_state, permission_mode, review_artifact_kind, role, status,
        CreateSessionRequest, CreateWorkspaceRequest, DiffFallbackResponse, InboxItem, Message,
        PermissionRequest, PromptRequest, ResolvePermissionRequest, ReviewArtifact,
        ReviewArtifactSummary, Session, SessionConfigState, SessionContinuity, SessionDetail,
        SessionListItem, SetSessionConfigOptionRequest, TimelineItem, Workspace,
    },
    storage::Storage,
};

#[cfg(feature = "embedded-frontend")]
use axum::{body::Body, http::Uri, response::Response};

#[cfg(feature = "embedded-frontend")]
use rust_embed::RustEmbed;

#[cfg(feature = "embedded-frontend")]
#[derive(RustEmbed)]
#[folder = "frontend/dist"]
struct FrontendAsset;

#[derive(Clone)]
pub struct AppState {
    pub storage: Storage,
    pub agents: Arc<AgentRuntimeManager>,
    pub events_tx: broadcast::Sender<RealtimeEvent>,
    pub auth: AuthService,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStateResponse {
    codex: ConnectionStatus,
    agents: Vec<AgentRuntimeStatus>,
    inbox: Vec<InboxItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptAcceptedResponse {
    message: Message,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    token: String,
}

pub fn api_router(state: AppState) -> Router {
    let protected = Router::new()
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
        .route("/api/sessions/{session_id}/restore", post(restore_session))
        .route(
            "/api/sessions/{session_id}/config-options/{config_id}",
            post(set_session_config_option),
        )
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
        .route("/api", any(api_not_found))
        .route("/api/{*path}", any(api_not_found))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    let public = Router::new()
        .route("/api/auth/status", get(auth_status))
        .route("/api/auth/pair", post(pair));

    protected.merge(public).with_state(state)
}

pub fn frontend_router(frontend_dist: Option<&PathBuf>) -> Router {
    match frontend_dist {
        Some(path) => disk_frontend_router(path.clone()),
        None => default_frontend_router(),
    }
}

fn disk_frontend_router(frontend_dist: PathBuf) -> Router {
    Router::new().fallback_service(
        ServeDir::new(frontend_dist.clone())
            .fallback(ServeFile::new(frontend_dist.join("index.html"))),
    )
}

#[cfg(feature = "embedded-frontend")]
fn default_frontend_router() -> Router {
    Router::new().fallback(embedded_frontend)
}

#[cfg(not(feature = "embedded-frontend"))]
fn default_frontend_router() -> Router {
    disk_frontend_router(crate::config::default_frontend_dist())
}

async fn api_not_found() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "API route not found" })),
    )
}

#[cfg(feature = "embedded-frontend")]
async fn embedded_frontend(uri: Uri) -> Response {
    let requested_path = uri.path().trim_start_matches('/');
    let asset_path = if requested_path.is_empty() {
        "index.html"
    } else {
        requested_path
    };

    if let Some(asset) = FrontendAsset::get(asset_path) {
        return embedded_asset_response(asset_path, asset.data.into_owned());
    }

    match FrontendAsset::get("index.html") {
        Some(asset) => embedded_asset_response("index.html", asset.data.into_owned()),
        None => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "embedded frontend index.html is missing",
        )
            .into_response(),
    }
}

#[cfg(feature = "embedded-frontend")]
fn embedded_asset_response(path: &str, data: Vec<u8>) -> Response {
    Response::builder()
        .header("content-type", content_type_for_path(path))
        .body(Body::from(data))
        .expect("embedded asset response is valid")
}

#[cfg(feature = "embedded-frontend")]
fn content_type_for_path(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or_default() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

async fn require_auth(
    State(state): State<AppState>,
    connect_info: Option<Extension<ConnectInfo<std::net::SocketAddr>>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<impl IntoResponse, AppError> {
    state
        .auth
        .require_access(
            &headers,
            connect_info.map(|Extension(ConnectInfo(addr))| addr),
        )
        .await?;
    Ok(next.run(request).await)
}

async fn auth_status(
    State(state): State<AppState>,
    connect_info: Option<Extension<ConnectInfo<std::net::SocketAddr>>>,
    headers: HeaderMap,
) -> AppResult<Json<AuthStatus>> {
    Ok(Json(
        state
            .auth
            .status(
                &headers,
                connect_info.map(|Extension(ConnectInfo(addr))| addr),
            )
            .await,
    ))
}

async fn pair(
    State(state): State<AppState>,
    connect_info: Option<Extension<ConnectInfo<std::net::SocketAddr>>>,
    Json(payload): Json<PairRequest>,
) -> AppResult<impl IntoResponse> {
    let peer = connect_info.map(|Extension(ConnectInfo(addr))| addr);
    let (status, cookie) = state.auth.pair(&payload.token, peer).await?;
    Ok((StatusCode::OK, [(SET_COOKIE, cookie)], Json(status)))
}

async fn app_state(State(state): State<AppState>) -> AppResult<Json<AppStateResponse>> {
    let inbox = state.storage.list_inbox_items().await?;
    Ok(Json(AppStateResponse {
        codex: state.agents.codex_status().await,
        agents: state.agents.statuses().await,
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
    payload: Option<Json<CreateSessionRequest>>,
) -> AppResult<Json<SessionDetail>> {
    let workspace = state
        .storage
        .get_workspace(&workspace_id)
        .await
        .map_err(|_| AppError::NotFound("Workspace not found".to_string()))?;

    let requested_agent_id = payload
        .as_ref()
        .and_then(|Json(payload)| payload.agent_id.as_deref());
    let agent_id = state
        .agents
        .resolve_agent_id(requested_agent_id)
        .map_err(|error| AppError::BadRequest(error.to_string()))?;
    let requested_permission_mode = payload
        .as_ref()
        .and_then(|Json(payload)| payload.permission_mode.as_deref());
    let permission_mode = state
        .agents
        .resolve_permission_mode(&agent_id, requested_permission_mode)
        .map_err(|error| AppError::BadRequest(error.to_string()))?;
    let runtime = state
        .agents
        .runtime_for_permission_mode_use(&agent_id, &permission_mode)
        .await
        .map_err(|error| AppError::ServiceUnavailable(error.to_string()))?;

    let new_session = runtime
        .new_session(workspace.path.clone())
        .await
        .map_err(|error| AppError::ServiceUnavailable(error.to_string()))?;
    let acp_session_id = new_session.session_id.clone();

    let session = state
        .storage
        .create_session_for_agent_with_permission_mode_and_config_options(
            &workspace.id,
            &agent_id,
            &runtime.agent().title,
            acp_session_id.clone(),
            &permission_mode,
            new_session.config_options,
        )
        .await
        .map_err(AppError::Other)?;
    runtime
        .register_session(acp_session_id, session.id.clone())
        .await;

    let detail = state.session_detail(&session.id).await?;
    Ok(Json(detail))
}

async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> AppResult<Json<SessionDetail>> {
    let detail = state.session_detail(&session_id).await?;
    Ok(Json(detail))
}

async fn restore_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> AppResult<Json<SessionDetail>> {
    let session = state
        .storage
        .get_session(&session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    let workspace = state.storage.get_workspace(&session.workspace_id).await?;
    let runtime = state.runtime_for_session_use(&session).await?;
    let continuity = state.session_continuity(&session).await?;

    if continuity.continuable {
        return Ok(Json(
            state
                .storage
                .session_detail_with_session_continuity(&session_id, continuity)
                .await?,
        ));
    }

    if !continuity.restorable || !runtime.can_load_session().await {
        return Err(AppError::Conflict(
            continuity
                .reason
                .unwrap_or_else(|| view_only_reason(&session.agent_name)),
        ));
    }

    let Some(external_session_id) = session
        .external_session_id
        .clone()
        .or_else(|| session.acp_session_id.clone())
    else {
        return Err(AppError::Conflict(
            "Session is missing an agent session id.".to_string(),
        ));
    };

    state
        .storage
        .mark_session_restore_started(&session_id)
        .await?;
    let _ = state.events_tx.send(RealtimeEvent::SessionRestoreStarted {
        session_id: session_id.clone(),
    });

    match runtime
        .load_session(external_session_id, session_id.clone(), workspace.path)
        .await
    {
        Ok(config_options) => {
            if config_options.is_some() {
                state
                    .storage
                    .update_session_config_options(&session_id, config_options)
                    .await?;
            }
            state
                .storage
                .mark_session_restore_succeeded(&session_id)
                .await?;
            let _ = state
                .events_tx
                .send(RealtimeEvent::SessionRestoreSucceeded {
                    session_id: session_id.clone(),
                });
            Ok(Json(state.session_detail(&session_id).await?))
        }
        Err(error) => {
            let message = format!("Failed to restore session: {error}");
            state
                .storage
                .mark_session_restore_failed(&session_id, &message)
                .await?;
            let _ = state.events_tx.send(RealtimeEvent::SessionRestoreFailed {
                session_id: session_id.clone(),
                message: message.clone(),
            });
            Err(AppError::Conflict(message))
        }
    }
}

async fn set_session_config_option(
    State(state): State<AppState>,
    Path((session_id, config_id)): Path<(String, String)>,
    Json(payload): Json<SetSessionConfigOptionRequest>,
) -> AppResult<Json<SessionConfigState>> {
    let config_id = config_id.trim();
    if config_id.is_empty() {
        return Err(AppError::BadRequest(
            "Configuration option id is required".to_string(),
        ));
    }
    let value = payload.value.trim().to_string();
    if value.is_empty() {
        return Err(AppError::BadRequest(
            "Configuration option value is required".to_string(),
        ));
    }

    let session = state
        .storage
        .get_session(&session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    let has_pending_permission = state
        .storage
        .pending_permission_for_session(&session_id)
        .await?
        .is_some();
    if has_pending_permission || session.status == status::WAITING_APPROVAL {
        return Err(AppError::Conflict(
            "This session is waiting for approval. Resolve the pending approval before changing configuration."
                .to_string(),
        ));
    }
    if session.status == status::RUNNING {
        return Err(AppError::Conflict(
            "This session is already running. Wait for it to finish before changing configuration."
                .to_string(),
        ));
    }

    let continuity = state.session_continuity(&session).await?;
    if !continuity.continuable {
        return Err(AppError::Conflict(
            continuity
                .reason
                .unwrap_or_else(|| view_only_reason(&session.agent_name)),
        ));
    }
    let Some(acp_session_id) = session.acp_session_id.clone() else {
        return Err(AppError::Conflict(
            "Session is missing an ACP session id".to_string(),
        ));
    };

    let current_state = state.storage.session_config_state(&session_id).await?;
    if current_config_value(&current_state, config_id) == Some(value.as_str()) {
        return Ok(Json(current_state));
    }

    let runtime = state.runtime_for_session_use(&session).await?;
    let updated = runtime
        .set_config_option(acp_session_id, config_id.to_string(), value)
        .await
        .map_err(|error| AppError::Conflict(error.to_string()))?;
    let config_state = state
        .storage
        .update_session_config_options(&session_id, updated.config_options)
        .await?;
    let _ = state.events_tx.send(RealtimeEvent::SessionConfigUpdated {
        session_id,
        config_options: config_state.config_options.clone(),
        current_model: config_state.current_model.clone(),
    });

    Ok(Json(config_state))
}

fn current_config_value<'a>(
    config_state: &'a SessionConfigState,
    config_id: &str,
) -> Option<&'a str> {
    config_state
        .config_options
        .as_ref()?
        .iter()
        .find(|option| option.id == config_id)?
        .current_value
        .as_deref()
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
    let has_pending_permission = state
        .storage
        .pending_permission_for_session(&session_id)
        .await?
        .is_some();

    if has_pending_permission || session.status == status::WAITING_APPROVAL {
        return Err(AppError::Conflict(
            "This session is waiting for approval. Resolve the pending approval before sending another prompt."
                .to_string(),
        ));
    }

    if session.status == status::RUNNING {
        return Err(AppError::Conflict(
            "This session is already running. Wait for it to finish before sending another prompt."
                .to_string(),
        ));
    }

    let continuity = state.session_continuity(&session).await?;
    if !continuity.continuable {
        let reason = match continuity.state.as_str() {
            continuity_state::LOADABLE | continuity_state::RESTORE_FAILED => {
                "Restore this session before sending another prompt.".to_string()
            }
            continuity_state::RESTORING => {
                "This session is currently restoring. Wait for restore to finish before sending a prompt."
                    .to_string()
            }
            _ => continuity
                .reason
                .unwrap_or_else(|| view_only_reason(&session.agent_name)),
        };
        return Err(AppError::Conflict(reason));
    }

    let Some(acp_session_id) = session.acp_session_id.clone() else {
        return Err(AppError::Conflict(
            "Session is missing an ACP session id".to_string(),
        ));
    };
    let runtime = state.runtime_for_existing_session(&session).await?;

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
        runtime,
        state.events_tx.clone(),
        session.id.clone(),
        acp_session_id,
        prompt,
    ));

    Ok(Json(PromptAcceptedResponse { message }))
}

impl AppState {
    async fn runtime_for_existing_session(
        &self,
        session: &Session,
    ) -> AppResult<Arc<CodexRuntime>> {
        self.agents
            .runtime_for_permission_mode(&session.agent_id, &session.permission_mode)
            .await
            .map_err(|error| AppError::ServiceUnavailable(error.to_string()))
    }

    async fn runtime_for_session_use(&self, session: &Session) -> AppResult<Arc<CodexRuntime>> {
        self.agents
            .runtime_for_permission_mode_use(&session.agent_id, &session.permission_mode)
            .await
            .map_err(|error| AppError::ServiceUnavailable(error.to_string()))
    }

    async fn session_detail(&self, session_id: &str) -> AppResult<SessionDetail> {
        let session = self
            .storage
            .get_session(session_id)
            .await
            .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
        let _ = self.runtime_for_session_use(&session).await;
        let continuity = self.session_continuity(&session).await?;
        self.storage
            .session_detail_with_session_continuity(session_id, continuity)
            .await
            .map_err(|_| AppError::NotFound("Session not found".to_string()))
    }

    async fn session_continuity(&self, session: &Session) -> AppResult<SessionContinuity> {
        let row = self.storage.session_continuity_row(&session.id).await?;
        let runtime = match self
            .agents
            .runtime_for_permission_mode(&session.agent_id, &session.permission_mode)
            .await
        {
            Ok(runtime) => runtime,
            Err(error) => {
                return Ok(SessionContinuity::view_only(format!(
                    "{} {}",
                    view_only_reason(&session.agent_name),
                    error
                )));
            }
        };
        let runtime_status = runtime.status().await;
        if runtime_status.state != "ready" {
            return Ok(SessionContinuity::view_only(agent_unavailable_reason(
                &session.agent_name,
                &runtime_status,
            )));
        }

        if runtime
            .has_registered_session(session.acp_session_id.as_deref())
            .await
        {
            return Ok(if row.continuation_state == continuity_state::RESTORED {
                SessionContinuity::restored(row.restore_completed_at)
            } else {
                SessionContinuity::live()
            });
        }

        let external_session_id = session
            .external_session_id
            .as_deref()
            .or(session.acp_session_id.as_deref());
        let runtime_continuity = runtime
            .runtime_session_continuity(session.acp_session_id.as_deref(), external_session_id)
            .await;
        let can_load = runtime_continuity.state == continuity_state::LOADABLE;

        match row.continuation_state.as_str() {
            continuity_state::RESTORING => Ok(SessionContinuity::restoring(row.restore_started_at)),
            continuity_state::RESTORE_FAILED => Ok(SessionContinuity::restore_failed(
                row.restore_failure_message
                    .unwrap_or_else(|| "Failed to restore session.".to_string()),
                row.restore_started_at,
                external_session_id.is_some() && can_load,
            )),
            _ => Ok(runtime_continuity),
        }
    }
}

async fn apply_session_list_continuity(
    state: &AppState,
    items: Vec<SessionListItem>,
) -> Vec<SessionListItem> {
    let mut updated = Vec::with_capacity(items.len());
    for mut item in items {
        let continuity = match state.session_continuity(&item.session).await {
            Ok(continuity) => continuity,
            Err(error) => {
                tracing::error!(?error, "failed to project session continuity");
                SessionContinuity::view_only(view_only_reason(&item.session.agent_name))
            }
        };
        item.continuable = continuity.continuable;
        item.view_only_reason = continuity
            .reason
            .clone()
            .filter(|_| !continuity.continuable);
        item.continuity = continuity;
        updated.push(item);
    }
    updated
}

fn view_only_reason(agent_name: &str) -> String {
    format!(
        "This session history is available for review, but the live {agent_name} runtime context is not available. Start a new session to continue working."
    )
}

fn agent_unavailable_reason(agent_name: &str, status: &ConnectionStatus) -> String {
    let suffix = status
        .message
        .as_deref()
        .map(|message| format!(": {message}"))
        .unwrap_or_default();
    format!(
        "{agent_name} is {}{suffix}. This session history is available for review, but the live {agent_name} runtime context is not available. Prompts are disabled until the agent runtime is ready.",
        status.state
    )
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

    let stored_permission = state
        .storage
        .get_permission_request(&permission_id)
        .await
        .map_err(|_| AppError::NotFound("Permission request not found".to_string()))?;
    let session = state
        .storage
        .get_session(&stored_permission.session_id)
        .await
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    let runtime = state.runtime_for_existing_session(&session).await?;

    let permission = runtime
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
    let runtime = state.runtime_for_existing_session(&session).await?;
    if state
        .storage
        .pending_permission_for_session(&session_id)
        .await?
        .is_none()
    {
        return Err(AppError::Conflict(
            "Only sessions waiting for approval can be cancelled in this version.".to_string(),
        ));
    }

    runtime
        .cancel_pending_permissions_for_session(&session_id)
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

    Ok(Json(state.session_detail(&session_id).await?))
}

async fn run_prompt_turn(
    storage: Storage,
    runtime: Arc<CodexRuntime>,
    events_tx: broadcast::Sender<RealtimeEvent>,
    session_id: String,
    acp_session_id: String,
    prompt: String,
) {
    match runtime.prompt(acp_session_id, prompt).await {
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
            match storage.pending_permission_for_session(&session_id).await {
                Ok(Some(_)) => {
                    tracing::debug!(
                        session_id,
                        "prompt turn completed with pending permission; preserving waiting_approval"
                    );
                }
                Ok(None) => {
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
                    tracing::error!(
                        ?error,
                        "failed to inspect pending permission before marking session idle"
                    );
                }
            }
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
        status: state.agents.codex_status().await,
    };
    if send_ws_event(&mut socket, &initial).await.is_err() {
        return;
    }
    for agent in state.agents.statuses().await {
        let event = RealtimeEvent::AgentConnectionStatus {
            agent_id: agent.id,
            permission_mode: permission_mode::MANUAL.to_string(),
            status: agent.status,
        };
        if send_ws_event(&mut socket, &event).await.is_err() {
            return;
        }
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
        extract::connect_info::ConnectInfo,
        http::{Request, StatusCode},
        Router,
    };
    use serde_json::Value;
    use tower::ServiceExt;

    use super::*;
    use std::{
        collections::HashMap, net::SocketAddr, path::PathBuf, process::Command as StdCommand,
        time::Duration,
    };
    use tokio::time::{sleep, timeout};

    use crate::{
        config::{manual_permission_mode, AgentConfig, Config, CLAUDE_AGENT_ID, CODEX_AGENT_ID},
        models::{AgentSessionCapabilities, NewReviewArtifact},
        storage::NewPermissionRequest,
    };

    async fn test_state() -> (AppState, tempfile::TempDir) {
        test_state_with_auth(Some("test-token".to_string()), true, vec![]).await
    }

    async fn test_state_with_capabilities(
        session_capabilities: AgentSessionCapabilities,
    ) -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let database_url = format!("sqlite://{}", dir.path().join("test.db").display());
        let storage = Storage::connect(&database_url).await.unwrap();
        storage.migrate().await.unwrap();
        let (events_tx, _) = broadcast::channel(16);
        let config = Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            work_dir: dir.path().to_path_buf(),
            database_url,
            codex_acp_command: "codex-acp".to_string(),
            codex_acp_args: vec![],
            claude_acp_enabled: false,
            claude_acp_command: "npx".to_string(),
            claude_acp_args: vec![],
            frontend_dist: Some(dir.path().join("dist")),
            pairing_token: Some("test-token".to_string()),
            disable_auth: true,
            trusted_clients: vec![],
        };
        let auth = AuthService::from_config(&config).unwrap();
        let codex = CodexRuntime::ready_for_tests(
            config.clone(),
            storage.clone(),
            events_tx.clone(),
            session_capabilities,
        );
        let agents = AgentRuntimeManager::for_tests(
            &config,
            storage.clone(),
            events_tx.clone(),
            HashMap::from([(codex.agent().id.clone(), codex.clone())]),
        );

        (
            AppState {
                storage,
                agents,
                events_tx,
                auth,
            },
            dir,
        )
    }

    async fn auth_test_state() -> (AppState, tempfile::TempDir) {
        test_state_with_auth(Some("test-token".to_string()), false, vec![]).await
    }

    async fn test_state_with_fake_agents() -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let database_url = format!("sqlite://{}", dir.path().join("test.db").display());
        let storage = Storage::connect(&database_url).await.unwrap();
        storage.migrate().await.unwrap();
        let (events_tx, _) = broadcast::channel(64);
        let script = write_multi_agent_fake_acp(&dir);
        let config = Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            work_dir: dir.path().to_path_buf(),
            database_url,
            codex_acp_command: "codex-acp".to_string(),
            codex_acp_args: vec![],
            claude_acp_enabled: true,
            claude_acp_command: "npx".to_string(),
            claude_acp_args: vec![],
            frontend_dist: Some(dir.path().join("dist")),
            pairing_token: Some("test-token".to_string()),
            disable_auth: true,
            trusted_clients: vec![],
        };
        let auth = AuthService::from_config(&config).unwrap();
        let codex = CodexRuntime::start_for_agent(
            fake_agent(CODEX_AGENT_ID, "Codex", script.clone()),
            storage.clone(),
            events_tx.clone(),
        )
        .await;
        let claude = CodexRuntime::start_for_agent(
            fake_agent(CLAUDE_AGENT_ID, "Claude", script),
            storage.clone(),
            events_tx.clone(),
        )
        .await;
        assert_eq!(codex.status().await.state, "ready");
        assert_eq!(claude.status().await.state, "ready");
        let agents = AgentRuntimeManager::for_tests(
            &config,
            storage.clone(),
            events_tx.clone(),
            HashMap::from([
                (CODEX_AGENT_ID.to_string(), codex),
                (CLAUDE_AGENT_ID.to_string(), claude),
            ]),
        );

        (
            AppState {
                storage,
                agents,
                events_tx,
                auth,
            },
            dir,
        )
    }

    async fn test_state_with_lazy_fake_codex() -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let database_url = format!("sqlite://{}", dir.path().join("test.db").display());
        let storage = Storage::connect(&database_url).await.unwrap();
        storage.migrate().await.unwrap();
        let (events_tx, _) = broadcast::channel(64);
        let script = write_multi_agent_fake_acp(&dir);
        let config = Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            work_dir: dir.path().to_path_buf(),
            database_url,
            codex_acp_command: "uv".to_string(),
            codex_acp_args: vec![
                "run".to_string(),
                "--script".to_string(),
                script.to_string_lossy().to_string(),
                CODEX_AGENT_ID.to_string(),
            ],
            claude_acp_enabled: false,
            claude_acp_command: "npx".to_string(),
            claude_acp_args: vec![],
            frontend_dist: Some(dir.path().join("dist")),
            pairing_token: Some("test-token".to_string()),
            disable_auth: true,
            trusted_clients: vec![],
        };
        let auth = AuthService::from_config(&config).unwrap();
        let agents = AgentRuntimeManager::start(&config, storage.clone(), events_tx.clone()).await;

        (
            AppState {
                storage,
                agents,
                events_tx,
                auth,
            },
            dir,
        )
    }

    fn fake_agent(id: &str, title: &str, script: PathBuf) -> AgentConfig {
        AgentConfig {
            id: id.to_string(),
            title: title.to_string(),
            command: "uv".to_string(),
            args: vec![
                "run".to_string(),
                "--script".to_string(),
                script.to_string_lossy().to_string(),
                id.to_string(),
            ],
            enabled: true,
            permission_modes: vec![manual_permission_mode()],
        }
    }

    fn write_multi_agent_fake_acp(dir: &tempfile::TempDir) -> PathBuf {
        let script = dir.path().join("multi_agent_fake_acp.py");
        std::fs::write(
            &script,
            r#"
import json
import sys

agent = sys.argv[1]
current_model = "fast"

def send(message):
    print(json.dumps(message), flush=True)

def config_options():
    return [
        {
            "id": "model",
            "name": "Model",
            "category": "model",
            "type": "select",
            "currentValue": current_model,
            "options": [
                {"value": "fast", "name": "Fast model"},
                {"value": "pro", "name": "Pro model"},
                {"value": "ultra", "name": "Ultra model"}
            ]
        }
    ]

def prompt_text(message):
    chunks = message.get("params", {}).get("prompt", [])
    return "".join(chunk.get("text", "") for chunk in chunks if isinstance(chunk, dict))

for line in sys.stdin:
    if not line.strip():
        continue
    message = json.loads(line)
    method = message.get("method")
    request_id = message.get("id")

    if method == "initialize":
        send({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "agentInfo": {"name": agent},
                "agentCapabilities": {
                    "loadSession": True,
                    "sessionCapabilities": {"resume": False, "list": True}
                }
            }
        })
    elif method == "session/new":
        send({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"sessionId": "shared-session", "configOptions": config_options()}
        })
    elif method == "session/load":
        session_id = message.get("params", {}).get("sessionId", "shared-session")
        send({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": session_id,
                "update": {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {"type": "text", "text": "Restored by " + agent}
                }
            }
        })
        send({"jsonrpc": "2.0", "id": request_id, "result": {"sessionId": session_id, "configOptions": config_options()}})
    elif method == "session/set_config_option":
        config_id = message.get("params", {}).get("configId")
        value = message.get("params", {}).get("value")
        if config_id != "model" or value not in ["fast", "pro", "ultra"]:
            send({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32602, "message": "invalid config option"}
            })
            continue
        current_model = value
        send({"jsonrpc": "2.0", "id": request_id, "result": {"configOptions": config_options()}})
    elif method == "session/prompt":
        session_id = message.get("params", {}).get("sessionId", "shared-session")
        text = prompt_text(message).lower()
        if "permission" in text:
            send({
                "jsonrpc": "2.0",
                "id": agent + "-permission",
                "method": "session/request_permission",
                "params": {
                    "sessionId": session_id,
                    "toolCall": {
                        "toolCallId": "tool-" + agent,
                        "title": "Run " + agent,
                        "kind": "execute",
                        "content": [{"type": "text", "text": "echo " + agent}]
                    },
                    "options": [
                        {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                        {"optionId": "reject-once", "name": "Reject", "kind": "reject_once"}
                    ]
                }
            })
            response = json.loads(sys.stdin.readline())
            selected = response.get("result", {}).get("outcome", {}).get("optionId", "cancelled")
            content = "Permission resolved by " + agent + " with " + selected
        else:
            content = "Hello from " + agent
        send({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": session_id,
                "update": {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {"type": "text", "text": content}
                }
            }
        })
        send({"jsonrpc": "2.0", "id": request_id, "result": {}})
"#,
        )
        .unwrap();
        script
    }

    async fn test_state_with_auth(
        pairing_token: Option<String>,
        disable_auth: bool,
        trusted_clients: Vec<String>,
    ) -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let database_url = format!("sqlite://{}", dir.path().join("test.db").display());
        let storage = Storage::connect(&database_url).await.unwrap();
        storage.migrate().await.unwrap();
        let (events_tx, _) = broadcast::channel(16);
        let config = Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            work_dir: dir.path().to_path_buf(),
            database_url,
            codex_acp_command: "__acp_webui_test_missing_acp__".to_string(),
            codex_acp_args: vec![],
            claude_acp_enabled: false,
            claude_acp_command: "npx".to_string(),
            claude_acp_args: vec![],
            frontend_dist: Some(dir.path().join("dist")),
            pairing_token,
            disable_auth,
            trusted_clients,
        };
        let auth = AuthService::from_config(&config).unwrap();
        let codex =
            CodexRuntime::failed_for_tests(config.clone(), storage.clone(), events_tx.clone());
        let agents = AgentRuntimeManager::for_tests(
            &config,
            storage.clone(),
            events_tx.clone(),
            HashMap::from([(codex.agent().id.clone(), codex.clone())]),
        );

        (
            AppState {
                storage,
                agents,
                events_tx,
                auth,
            },
            dir,
        )
    }

    fn request_with_peer(
        builder: axum::http::request::Builder,
        body: Body,
        peer: &str,
    ) -> Request<Body> {
        let mut request = builder.body(body).unwrap();
        request
            .extensions_mut()
            .insert(ConnectInfo(peer.parse::<SocketAddr>().unwrap()));
        request
    }

    fn untrusted_peer() -> &'static str {
        "192.168.1.23:48152"
    }

    fn loopback_peer() -> &'static str {
        "127.0.0.1:48152"
    }

    async fn wait_for_message_containing(storage: &Storage, session_id: &str, needle: &str) {
        timeout(Duration::from_secs(3), async {
            loop {
                let messages = storage.list_messages(session_id).await.unwrap();
                if messages
                    .iter()
                    .any(|message| message.content.contains(needle))
                {
                    break;
                }
                sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap();
    }

    async fn wait_for_pending_permission(storage: &Storage, session_id: &str) -> PermissionRequest {
        timeout(Duration::from_secs(3), async {
            loop {
                if let Some(permission) = storage
                    .pending_permission_for_session(session_id)
                    .await
                    .unwrap()
                {
                    break permission;
                }
                sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn disk_frontend_serves_assets_and_spa_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let dist = dir.path().join("dist");
        std::fs::create_dir_all(dist.join("assets")).unwrap();
        std::fs::write(dist.join("index.html"), "<html><body>app</body></html>").unwrap();
        std::fs::write(dist.join("assets").join("app.js"), "console.log('app');").unwrap();
        let app = frontend_router(Some(&dist));

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/assets/app.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&body[..], b"console.log('app');");

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/sessions/example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("<body>app</body>"));
    }

    #[cfg(feature = "embedded-frontend")]
    #[tokio::test]
    async fn embedded_frontend_serves_index_assets_and_spa_fallback() {
        let app = frontend_router(None);

        let response = app
            .clone()
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap();
        assert!(content_type.contains("text/html"));
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("<div id=\"app\"></div>"));

        let asset_path = FrontendAsset::iter()
            .find(|path| path.ends_with(".js") || path.ends_with(".css"))
            .expect("frontend build contains a JavaScript or CSS asset")
            .into_owned();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/{asset_path}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get("content-type").is_some());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/sessions/example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("<div id=\"app\"></div>"));
    }

    #[tokio::test]
    async fn api_routes_do_not_fall_through_to_frontend() {
        let (state, dir) = test_state().await;
        let dist = dir.path().join("dist");
        std::fs::create_dir_all(&dist).unwrap();
        std::fs::write(
            dist.join("index.html"),
            "<html><body>frontend</body></html>",
        )
        .unwrap();
        let app = Router::new()
            .merge(api_router(state))
            .merge(frontend_router(Some(&dist)));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/not-a-route")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("API route not found"));
    }

    #[tokio::test]
    async fn auth_status_reports_anonymous_paired_and_trusted_access() {
        let (state, _dir) = auth_test_state().await;
        let app = api_router(state);

        let response = app
            .clone()
            .oneshot(request_with_peer(
                Request::builder().uri("/api/auth/status"),
                Body::empty(),
                untrusted_peer(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["access"], "anonymous");
        assert_eq!(json["pairingRequired"], true);

        let pair_response = app
            .clone()
            .oneshot(request_with_peer(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/pair")
                    .header("content-type", "application/json"),
                Body::from(r#"{"token":"test-token"}"#),
                untrusted_peer(),
            ))
            .await
            .unwrap();
        let cookie = pair_response
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();

        let response = app
            .clone()
            .oneshot(request_with_peer(
                Request::builder()
                    .uri("/api/auth/status")
                    .header("cookie", cookie),
                Body::empty(),
                untrusted_peer(),
            ))
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["access"], "paired_session");

        let response = app
            .oneshot(request_with_peer(
                Request::builder().uri("/api/auth/status"),
                Body::empty(),
                loopback_peer(),
            ))
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["access"], "trusted_ip");
    }

    #[tokio::test]
    async fn protected_api_rejects_anonymous_untrusted_requests() {
        let (state, _dir) = auth_test_state().await;
        let app = api_router(state);

        let response = app
            .oneshot(request_with_peer(
                Request::builder().uri("/api/app-state"),
                Body::empty(),
                untrusted_peer(),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn valid_pairing_cookie_allows_protected_api_access() {
        let (state, _dir) = auth_test_state().await;
        let app = api_router(state);

        let pair_response = app
            .clone()
            .oneshot(request_with_peer(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/pair")
                    .header("content-type", "application/json"),
                Body::from(r#"{"token":"test-token"}"#),
                untrusted_peer(),
            ))
            .await
            .unwrap();
        assert_eq!(pair_response.status(), StatusCode::OK);
        let cookie = pair_response
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();

        let response = app
            .oneshot(request_with_peer(
                Request::builder()
                    .uri("/api/app-state")
                    .header("cookie", cookie),
                Body::empty(),
                untrusted_peer(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["codex"]["state"], "failed");
        assert!(json.get("token").is_none());
    }

    #[tokio::test]
    async fn invalid_pairing_token_is_rejected() {
        let (state, _dir) = auth_test_state().await;
        let app = api_router(state);

        let response = app
            .oneshot(request_with_peer(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/pair")
                    .header("content-type", "application/json"),
                Body::from(r#"{"token":"wrong"}"#),
                untrusted_peer(),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(response.headers().get("set-cookie").is_none());
    }

    #[tokio::test]
    async fn trusted_clients_bypass_pairing_only_when_explicitly_configured() {
        let (state, _dir) = test_state_with_auth(
            Some("test-token".to_string()),
            false,
            vec!["100.64.0.0/10".to_string()],
        )
        .await;
        let app = api_router(state);

        let response = app
            .clone()
            .oneshot(request_with_peer(
                Request::builder().uri("/api/app-state"),
                Body::empty(),
                "100.64.12.34:48152",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let response = app
            .oneshot(request_with_peer(
                Request::builder().uri("/api/app-state"),
                Body::empty(),
                untrusted_peer(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn forwarded_headers_do_not_bypass_pairing() {
        let (state, _dir) = auth_test_state().await;
        let app = api_router(state);

        let response = app
            .oneshot(request_with_peer(
                Request::builder()
                    .uri("/api/app-state")
                    .header("x-forwarded-for", "127.0.0.1")
                    .header("forwarded", "for=127.0.0.1"),
                Body::empty(),
                untrusted_peer(),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn websocket_route_is_auth_protected() {
        let (state, _dir) = auth_test_state().await;
        let app = api_router(state);

        let anonymous = app
            .clone()
            .oneshot(request_with_peer(
                Request::builder().uri("/api/ws"),
                Body::empty(),
                untrusted_peer(),
            ))
            .await
            .unwrap();
        assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);

        let trusted = app
            .oneshot(request_with_peer(
                Request::builder().uri("/api/ws"),
                Body::empty(),
                loopback_peer(),
            ))
            .await
            .unwrap();
        assert_ne!(trusted.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn app_state_reports_codex_status() {
        let (state, _dir) = test_state().await;
        let app = api_router(state);

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
        assert_eq!(json["agents"][0]["id"], "codex");
        assert_eq!(json["agents"][0]["status"]["state"], "failed");
    }

    #[tokio::test]
    async fn creates_codex_and_claude_sessions_in_same_workspace() {
        let (state, _dir) = test_state_with_fake_agents().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let app = api_router(state);

        let codex_body = serde_json::json!({"agentId": "codex"});
        let codex_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .header("content-type", "application/json")
                    .body(Body::from(codex_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(codex_response.status(), StatusCode::OK);
        let body = to_bytes(codex_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let codex_json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(codex_json["session"]["agentId"], "codex");
        assert_eq!(codex_json["session"]["agentName"], "Codex");
        assert_eq!(
            codex_json["session"]["permissionMode"],
            permission_mode::MANUAL
        );

        let claude_body = serde_json::json!({"agentId": "claude"});
        let claude_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .header("content-type", "application/json")
                    .body(Body::from(claude_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(claude_response.status(), StatusCode::OK);
        let body = to_bytes(claude_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let claude_json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(claude_json["session"]["agentId"], "claude");
        assert_eq!(claude_json["session"]["agentName"], "Claude");
        assert_eq!(
            claude_json["session"]["permissionMode"],
            permission_mode::MANUAL
        );

        let list_response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let body = to_bytes(list_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let list: Value = serde_json::from_slice(&body).unwrap();
        let agent_ids = list
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["session"]["agentId"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert!(agent_ids.contains(&"codex"));
        assert!(agent_ids.contains(&"claude"));
    }

    #[tokio::test]
    async fn creates_codex_session_with_explicit_yolo_permission_mode() {
        let (state, _dir) = test_state_with_lazy_fake_codex().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let app = api_router(state);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "agentId": "codex",
                            "permissionMode": "yolo"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let detail: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(detail["session"]["permissionMode"], permission_mode::YOLO);

        let list_response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(list_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let list: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(list[0]["session"]["permissionMode"], permission_mode::YOLO);
    }

    #[tokio::test]
    async fn rejects_permission_mode_unsupported_by_agent_before_creating_session() {
        let (state, _dir) = test_state_with_fake_agents().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let app = api_router(state.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "agentId": "claude",
                            "permissionMode": "yolo"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(state.storage.list_session_items().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn session_creation_returns_and_lists_model_config_projection() {
        let (state, _dir) = test_state_with_fake_agents().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let app = api_router(state);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"agentId":"codex"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let detail: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(detail["configOptions"][0]["id"], "model");
        assert_eq!(detail["currentModel"]["configId"], "model");
        assert_eq!(detail["currentModel"]["value"], "fast");
        assert_eq!(detail["currentModel"]["name"], "Fast model");

        let list_response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let body = to_bytes(list_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let list: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(list[0]["currentModel"]["name"], "Fast model");
    }

    #[tokio::test]
    async fn config_option_route_switches_model_and_emits_realtime_update() {
        let (state, _dir) = test_state_with_fake_agents().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let mut events_rx = state.events_tx.subscribe();
        let app = api_router(state.clone());

        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"agentId":"codex"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(create_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let detail: Value = serde_json::from_slice(&body).unwrap();
        let session_id = detail["session"]["id"].as_str().unwrap();

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/config-options/model", session_id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"value":"pro"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["currentModel"]["value"], "pro");
        assert_eq!(
            state
                .storage
                .session_detail(session_id)
                .await
                .unwrap()
                .current_model
                .unwrap()
                .name
                .as_deref(),
            Some("Pro model")
        );

        let event = timeout(Duration::from_secs(1), async {
            loop {
                match events_rx.recv().await.unwrap() {
                    RealtimeEvent::SessionConfigUpdated {
                        session_id: event_session_id,
                        current_model,
                        ..
                    } if event_session_id == session_id => break current_model.unwrap(),
                    _ => {}
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(event.value, "pro");
    }

    #[tokio::test]
    async fn config_option_route_rejects_invalid_states_without_losing_snapshot() {
        let (state, _dir) = test_state_with_fake_agents().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let app = api_router(state.clone());

        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/workspaces/{}/sessions", workspace.id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"agentId":"codex"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(create_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let detail: Value = serde_json::from_slice(&body).unwrap();
        let session_id = detail["session"]["id"].as_str().unwrap();

        let empty_value_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/config-options/model", session_id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"value":""}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(empty_value_response.status(), StatusCode::BAD_REQUEST);

        state
            .storage
            .update_session_status(session_id, status::RUNNING)
            .await
            .unwrap();
        let running_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/config-options/model", session_id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"value":"pro"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(running_response.status(), StatusCode::CONFLICT);

        state
            .storage
            .update_session_status(session_id, status::IDLE)
            .await
            .unwrap();
        let rejected_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/config-options/model", session_id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"value":"missing"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(rejected_response.status(), StatusCode::CONFLICT);
        assert_eq!(
            state
                .storage
                .session_detail(session_id)
                .await
                .unwrap()
                .current_model
                .unwrap()
                .value,
            "fast"
        );

        state
            .storage
            .create_permission_request(NewPermissionRequest {
                session_id: session_id.to_string(),
                acp_session_id: "shared-session".to_string(),
                acp_request_id: "config-waiting".to_string(),
                tool_call_id: Some("tool-config-waiting".to_string()),
                title: "Approve before model".to_string(),
                kind: "execute".to_string(),
                tool_call_json: serde_json::json!({"toolCallId": "tool-config-waiting"}),
                options_json: serde_json::json!([
                    {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"}
                ]),
            })
            .await
            .unwrap();
        let waiting_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/config-options/model", session_id))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"value":"pro"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(waiting_response.status(), StatusCode::CONFLICT);

        let unregistered = state
            .storage
            .create_session_for_agent(
                &workspace.id,
                "codex",
                "Codex",
                "unregistered-acp-session".to_string(),
            )
            .await
            .unwrap();
        let non_continuable_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/sessions/{}/config-options/model",
                        unregistered.id
                    ))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"value":"pro"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(non_continuable_response.status(), StatusCode::CONFLICT);

        let missing_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/sessions/missing/config-options/model")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"value":"pro"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing_response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn routes_prompt_restore_and_permission_by_session_agent() {
        let (state, _dir) = test_state_with_fake_agents().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let workspace = state
            .storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let codex_session = state
            .storage
            .create_session_for_agent(
                &workspace.id,
                "codex",
                "Codex",
                "shared-session".to_string(),
            )
            .await
            .unwrap();
        let claude_session = state
            .storage
            .create_session_for_agent(
                &workspace.id,
                "claude",
                "Claude",
                "shared-session".to_string(),
            )
            .await
            .unwrap();
        state
            .agents
            .runtime("codex")
            .await
            .unwrap()
            .register_session("shared-session".to_string(), codex_session.id.clone())
            .await;
        state
            .agents
            .runtime("claude")
            .await
            .unwrap()
            .register_session("shared-session".to_string(), claude_session.id.clone())
            .await;
        let app = api_router(state.clone());

        let prompt_body = serde_json::json!({"prompt": "hello"});
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/prompt", claude_session.id))
                    .header("content-type", "application/json")
                    .body(Body::from(prompt_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        wait_for_message_containing(&state.storage, &claude_session.id, "Hello from claude").await;
        assert!(!state
            .storage
            .list_messages(&codex_session.id)
            .await
            .unwrap()
            .iter()
            .any(|message| message.content.contains("Hello from claude")));

        let restore_session = state
            .storage
            .create_session_for_agent(
                &workspace.id,
                "claude",
                "Claude",
                "restore-claude".to_string(),
            )
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/restore", restore_session.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        wait_for_message_containing(&state.storage, &restore_session.id, "Restored by claude")
            .await;
        assert_eq!(
            state
                .storage
                .session_detail(&restore_session.id)
                .await
                .unwrap()
                .current_model
                .unwrap()
                .name
                .as_deref(),
            Some("Fast model")
        );

        let permission_body = serde_json::json!({"prompt": "needs permission"});
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/prompt", claude_session.id))
                    .header("content-type", "application/json")
                    .body(Body::from(permission_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let permission = wait_for_pending_permission(&state.storage, &claude_session.id).await;
        let resolve_body = serde_json::json!({"optionId": "allow-once"});
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/permission-requests/{}/resolve",
                        permission.id
                    ))
                    .header("content-type", "application/json")
                    .body(Body::from(resolve_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        wait_for_message_containing(
            &state.storage,
            &claude_session.id,
            "Permission resolved by claude with allow-once",
        )
        .await;
    }

    #[tokio::test]
    async fn workspace_endpoints_create_and_list_workspaces() {
        let (state, _db_dir) = test_state().await;
        let workspace_dir = tempfile::tempdir().unwrap();
        let app = api_router(state);

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
        let app = api_router(state);

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
        let app = api_router(state);

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
        let app = api_router(state);

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
        let app = api_router(state);

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
        let app = api_router(state);

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
        let app = api_router(state.clone());

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
        let app = api_router(state);

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
    async fn prompt_is_rejected_when_pending_permission_exists_even_if_status_drifted_idle() {
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
            .update_session_status(&session.id, status::IDLE)
            .await
            .unwrap();
        let app = api_router(state);

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
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert!(json["error"]
            .as_str()
            .unwrap()
            .contains("waiting for approval"));
    }

    #[tokio::test]
    async fn cancel_allows_pending_permission_even_if_status_drifted_idle() {
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
            .update_session_status(&session.id, status::IDLE)
            .await
            .unwrap();
        let app = api_router(state.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/cancel", session.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            state
                .storage
                .get_permission_request(&permission.id)
                .await
                .unwrap()
                .status,
            crate::models::permission_status::CANCELLED
        );
        assert_eq!(
            state.storage.get_session(&session.id).await.unwrap().status,
            status::FAILED
        );
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
        let app = api_router(state);

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
    async fn session_detail_projects_loadable_continuity_when_agent_can_load() {
        let (state, _db_dir) = test_state_with_capabilities(AgentSessionCapabilities {
            load_session: true,
            resume_session: false,
            list_sessions: true,
            close_session: false,
        })
        .await;
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
        let app = api_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/sessions/{}", session.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["continuity"]["state"], "loadable");
        assert_eq!(json["continuity"]["restorable"], true);
        assert_eq!(json["continuable"], false);
    }

    #[tokio::test]
    async fn prompt_is_rejected_before_restore_and_accepted_after_runtime_registration() {
        let (state, _db_dir) = test_state_with_capabilities(AgentSessionCapabilities {
            load_session: true,
            resume_session: false,
            list_sessions: true,
            close_session: false,
        })
        .await;
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
        let app = api_router(state.clone());
        let body = serde_json::json!({"prompt": "continue"});

        let response = app
            .clone()
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
        let response_body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&response_body).unwrap();
        assert!(json["error"].as_str().unwrap().contains("Restore"));

        state
            .agents
            .runtime("codex")
            .await
            .unwrap()
            .register_session("acp-session".to_string(), session.id.clone())
            .await;
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

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn restore_endpoint_records_failure_state() {
        let (state, _db_dir) = test_state_with_capabilities(AgentSessionCapabilities {
            load_session: true,
            resume_session: false,
            list_sessions: true,
            close_session: false,
        })
        .await;
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
        let app = api_router(state.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/sessions/{}/restore", session.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        let detail = state.session_detail(&session.id).await.unwrap();
        assert_eq!(detail.continuity.state, "restore_failed");
        assert!(detail
            .continuity
            .failure_message
            .as_deref()
            .unwrap()
            .contains("not available"));
    }

    #[tokio::test]
    async fn resolve_requires_live_permission_responder() {
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
        let app = api_router(state.clone());

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
        let app = api_router(state);

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
