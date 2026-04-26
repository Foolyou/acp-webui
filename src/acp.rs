use std::{
    collections::HashMap,
    process::Stdio,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc,
    },
};

use anyhow::{anyhow, Context};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::{broadcast, mpsc, oneshot, Mutex, RwLock},
};

use crate::{
    config::Config,
    models::{
        permission_option_kind, permission_status, review_artifact_kind, role, status,
        tool_call_status, NewReviewArtifact, PermissionRequest, ReviewArtifact,
        ReviewArtifactSummary, TimelineItem, ToolCallRow, UpsertToolCall,
    },
    storage::{NewPermissionRequest, Storage},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub state: String,
    pub message: Option<String>,
    pub agent_info: Option<Value>,
}

impl ConnectionStatus {
    fn starting() -> Self {
        Self {
            state: "starting".to_string(),
            message: Some("Starting codex-acp".to_string()),
            agent_info: None,
        }
    }

    fn ready(agent_info: Option<Value>) -> Self {
        Self {
            state: "ready".to_string(),
            message: None,
            agent_info,
        }
    }

    fn failed(message: impl Into<String>) -> Self {
        Self {
            state: "failed".to_string(),
            message: Some(message.into()),
            agent_info: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RealtimeEvent {
    ConnectionStatus {
        status: ConnectionStatus,
    },
    SessionStatus {
        session_id: String,
        status: String,
    },
    TextDelta {
        session_id: String,
        delta: String,
    },
    AssistantMessage {
        session_id: String,
        content: String,
    },
    PermissionRequested {
        permission: PermissionRequest,
    },
    PermissionResolved {
        session_id: String,
        permission_id: String,
    },
    ReviewArtifact {
        artifact: ReviewArtifactSummary,
    },
    TimelineItemUpsert {
        item: TimelineItem,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone)]
pub struct PromptOutcome {
    pub content: String,
}

#[derive(Debug)]
pub struct CodexRuntime {
    config: Config,
    storage: Storage,
    status: Arc<RwLock<ConnectionStatus>>,
    peer: RwLock<Option<Arc<JsonRpcPeer>>>,
    session_map: Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: Arc<Mutex<HashMap<String, String>>>,
    events_tx: broadcast::Sender<RealtimeEvent>,
}

impl CodexRuntime {
    pub async fn start(
        config: Config,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        let runtime = Arc::new(Self {
            config,
            storage,
            status: Arc::new(RwLock::new(ConnectionStatus::starting())),
            peer: RwLock::new(None),
            session_map: Arc::new(RwLock::new(HashMap::new())),
            assistant_buffers: Arc::new(Mutex::new(HashMap::new())),
            events_tx,
        });

        runtime.emit_status().await;

        if let Err(error) = runtime.connect().await {
            tracing::error!(?error, "failed to initialize codex-acp");
            *runtime.status.write().await = ConnectionStatus::failed(error.to_string());
            runtime.emit_status().await;
        }

        runtime
    }

    #[cfg(test)]
    pub fn failed_for_tests(
        config: Config,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        Arc::new(Self {
            config,
            storage,
            status: Arc::new(RwLock::new(ConnectionStatus::failed(
                "Codex runtime disabled for test",
            ))),
            peer: RwLock::new(None),
            session_map: Arc::new(RwLock::new(HashMap::new())),
            assistant_buffers: Arc::new(Mutex::new(HashMap::new())),
            events_tx,
        })
    }

    pub async fn status(&self) -> ConnectionStatus {
        self.status.read().await.clone()
    }

    pub async fn ensure_ready(&self) -> anyhow::Result<Arc<JsonRpcPeer>> {
        if self.status.read().await.state != "ready" {
            let status = self.status.read().await.clone();
            return Err(anyhow!(
                "Codex connection is not ready{}",
                status
                    .message
                    .as_deref()
                    .map(|message| format!(": {message}"))
                    .unwrap_or_default()
            ));
        }

        self.peer
            .read()
            .await
            .clone()
            .ok_or_else(|| anyhow!("Codex connection is not available"))
    }

    pub async fn new_session(&self, cwd: String) -> anyhow::Result<String> {
        let peer = self.ensure_ready().await?;
        let result = peer
            .request(
                "session/new",
                json!({
                    "cwd": cwd,
                    "mcpServers": []
                }),
            )
            .await?;

        let acp_session_id = result
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("session/new response did not include sessionId"))?
            .to_string();

        Ok(acp_session_id)
    }

    pub async fn register_session(&self, acp_session_id: String, local_session_id: String) {
        self.session_map
            .write()
            .await
            .insert(acp_session_id, local_session_id);
    }

    pub async fn has_registered_session(&self, acp_session_id: Option<&str>) -> bool {
        let Some(acp_session_id) = acp_session_id else {
            return false;
        };
        self.session_map.read().await.contains_key(acp_session_id)
    }

    pub async fn prompt(
        &self,
        acp_session_id: String,
        prompt: String,
    ) -> anyhow::Result<PromptOutcome> {
        let peer = self.ensure_ready().await?;
        self.assistant_buffers
            .lock()
            .await
            .insert(acp_session_id.clone(), String::new());

        peer.request(
            "session/prompt",
            json!({
                "sessionId": acp_session_id,
                "prompt": [
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }),
        )
        .await?;

        let content = self
            .assistant_buffers
            .lock()
            .await
            .remove(&acp_session_id)
            .unwrap_or_default();

        Ok(PromptOutcome { content })
    }

    pub async fn resolve_permission(
        &self,
        permission_id: &str,
        option_id: &str,
    ) -> anyhow::Result<PermissionRequest> {
        let permission = self.storage.get_permission_request(permission_id).await?;
        anyhow::ensure!(
            permission.status == permission_status::PENDING,
            "permission request is not pending"
        );
        let option = permission
            .options
            .iter()
            .find(|candidate| candidate.option_id == option_id)
            .ok_or_else(|| anyhow!("permission option was not found"))?;
        anyhow::ensure!(
            option.kind == permission_option_kind::ALLOW_ONCE
                || option.kind == permission_option_kind::REJECT_ONCE,
            "this permission option is not available in this version"
        );

        let peer = self.ensure_ready().await?;
        peer.respond_to_permission(permission_id, selected_permission_response(option_id))
            .await?;
        self.storage
            .resolve_permission_request(permission_id, option_id)
            .await?;
        self.storage
            .update_session_status(&permission.session_id, status::RUNNING)
            .await?;
        let resolved = self.storage.get_permission_request(permission_id).await?;
        let _ = self.events_tx.send(RealtimeEvent::PermissionResolved {
            session_id: permission.session_id.clone(),
            permission_id: permission_id.to_string(),
        });
        let _ = self.events_tx.send(RealtimeEvent::SessionStatus {
            session_id: permission.session_id,
            status: status::RUNNING.to_string(),
        });
        Ok(resolved)
    }

    pub async fn cancel_pending_permission_for_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let Some(permission) = self
            .storage
            .pending_permission_for_session(session_id)
            .await?
        else {
            return Ok(None);
        };

        if let Some(peer) = self.peer.read().await.clone() {
            peer.respond_to_permission(&permission.id, cancelled_permission_response())
                .await?;
        }
        self.storage
            .cancel_permission_request(&permission.id)
            .await?;
        let _ = self.events_tx.send(RealtimeEvent::PermissionResolved {
            session_id: session_id.to_string(),
            permission_id: permission.id.clone(),
        });
        Ok(Some(permission.id))
    }

    async fn connect(&self) -> anyhow::Result<()> {
        let mut command = Command::new(&self.config.codex_acp_command);
        command
            .args(&self.config.codex_acp_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let child = command.spawn().with_context(|| {
            format!(
                "failed to launch `{}` with args {:?}",
                self.config.codex_acp_command, self.config.codex_acp_args
            )
        })?;

        let peer = JsonRpcPeer::spawn(
            child,
            self.events_tx.clone(),
            self.storage.clone(),
            self.session_map.clone(),
            self.assistant_buffers.clone(),
        )
        .await?;

        let result = peer
            .request(
                "initialize",
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {},
                    "clientInfo": {
                        "name": "acp-webui",
                        "title": "ACP Web UI",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                }),
            )
            .await?;

        let agent_info = result.get("agentInfo").cloned();
        *self.status.write().await = ConnectionStatus::ready(agent_info);
        *self.peer.write().await = Some(peer);
        self.emit_status().await;

        Ok(())
    }

    async fn emit_status(&self) {
        let _ = self.events_tx.send(RealtimeEvent::ConnectionStatus {
            status: self.status().await,
        });
    }
}

type PendingResult = Result<Value, JsonRpcError>;

#[derive(Debug, Clone, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

impl std::fmt::Display for JsonRpcError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "JSON-RPC error {}: {}", self.code, self.message)
    }
}

impl std::error::Error for JsonRpcError {}

#[derive(Debug)]
pub struct JsonRpcPeer {
    next_id: AtomicI64,
    writer_tx: mpsc::Sender<Value>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<PendingResult>>>>,
    permission_responders: Arc<Mutex<HashMap<String, Value>>>,
    _child: Mutex<Child>,
}

impl JsonRpcPeer {
    async fn spawn(
        mut child: Child,
        events_tx: broadcast::Sender<RealtimeEvent>,
        storage: Storage,
        session_map: Arc<RwLock<HashMap<String, String>>>,
        assistant_buffers: Arc<Mutex<HashMap<String, String>>>,
    ) -> anyhow::Result<Arc<Self>> {
        let stdin = child
            .stdin
            .take()
            .context("codex-acp stdin was not piped")?;
        let stdout = child
            .stdout
            .take()
            .context("codex-acp stdout was not piped")?;
        let stderr = child.stderr.take();

        let (writer_tx, mut writer_rx) = mpsc::channel::<Value>(256);
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let permission_responders = Arc::new(Mutex::new(HashMap::new()));

        tokio::spawn(async move {
            let mut stdin = stdin;
            while let Some(message) = writer_rx.recv().await {
                match serde_json::to_string(&message) {
                    Ok(line) => {
                        if stdin.write_all(line.as_bytes()).await.is_err()
                            || stdin.write_all(b"\n").await.is_err()
                            || stdin.flush().await.is_err()
                        {
                            tracing::error!("failed writing ACP message to codex-acp stdin");
                            break;
                        }
                    }
                    Err(error) => {
                        tracing::error!(?error, "failed to serialize ACP message");
                    }
                }
            }
        });

        let reader_pending = pending.clone();
        let reader_writer = writer_tx.clone();
        let reader_permission_responders = permission_responders.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            let disconnect_message;
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        if line.trim().is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<Value>(&line) {
                            Ok(message) => {
                                handle_incoming_message(
                                    message,
                                    &reader_pending,
                                    &reader_writer,
                                    &events_tx,
                                    &storage,
                                    &session_map,
                                    &assistant_buffers,
                                    &reader_permission_responders,
                                )
                                .await;
                            }
                            Err(error) => {
                                tracing::warn!(?error, line, "codex-acp stdout was not JSON");
                            }
                        }
                    }
                    Ok(None) => {
                        disconnect_message = "codex-acp stdout closed".to_string();
                        break;
                    }
                    Err(error) => {
                        tracing::error!(?error, "error reading codex-acp stdout");
                        disconnect_message = format!("error reading codex-acp stdout: {error}");
                        break;
                    }
                }
            }
            fail_pending_requests(&reader_pending, disconnect_message).await;
        });

        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::debug!(target: "codex_acp_stderr", "{}", line);
                }
            });
        }

        Ok(Arc::new(Self {
            next_id: AtomicI64::new(1),
            writer_tx,
            pending,
            permission_responders,
            _child: Mutex::new(child),
        }))
    }

    async fn request(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let key = id.to_string();
        let (reply_tx, reply_rx) = oneshot::channel();

        self.pending.lock().await.insert(key.clone(), reply_tx);

        let message = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });

        if self.writer_tx.send(message).await.is_err() {
            self.pending.lock().await.remove(&key);
            return Err(anyhow!("codex-acp stdin writer is closed"));
        }

        match reply_rx.await {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(error)) => Err(anyhow!(error)),
            Err(_) => Err(anyhow!("codex-acp response channel closed")),
        }
    }

    async fn respond_to_permission(
        &self,
        permission_id: &str,
        result: Value,
    ) -> anyhow::Result<()> {
        let Some(request_id) = self
            .permission_responders
            .lock()
            .await
            .remove(permission_id)
        else {
            return Err(anyhow!("permission request is no longer active"));
        };

        let response = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result
        });
        self.writer_tx
            .send(response)
            .await
            .map_err(|_| anyhow!("codex-acp stdin writer is closed"))?;
        Ok(())
    }
}

async fn fail_pending_requests(
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<PendingResult>>>>,
    message: String,
) {
    let mut pending = pending.lock().await;
    for (_, reply_tx) in pending.drain() {
        let _ = reply_tx.send(Err(JsonRpcError {
            code: -32000,
            message: message.clone(),
        }));
    }
}

async fn handle_incoming_message(
    message: Value,
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<PendingResult>>>>,
    writer_tx: &mpsc::Sender<Value>,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: &Arc<Mutex<HashMap<String, String>>>,
    permission_responders: &Arc<Mutex<HashMap<String, Value>>>,
) {
    if message.get("id").is_some()
        && (message.get("result").is_some() || message.get("error").is_some())
    {
        handle_response(message, pending).await;
        return;
    }

    let Some(method) = message.get("method").and_then(Value::as_str) else {
        tracing::debug!(?message, "ignored ACP message without method");
        return;
    };

    match method {
        "session/update" => {
            handle_session_update(message, events_tx, storage, session_map, assistant_buffers)
                .await;
        }
        "session/request_permission" => {
            handle_permission_request(
                message,
                writer_tx,
                events_tx,
                storage,
                session_map,
                permission_responders,
            )
            .await;
        }
        _ => {
            if message.get("id").is_some() {
                send_error_response(
                    message.get("id").cloned().unwrap_or(Value::Null),
                    -32601,
                    format!("Unsupported client method: {method}"),
                    writer_tx,
                )
                .await;
            } else {
                tracing::debug!(method, "ignored unsupported ACP notification");
            }
        }
    }
}

async fn handle_response(
    message: Value,
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<PendingResult>>>>,
) {
    let Some(id) = message.get("id") else {
        return;
    };
    let key = id.to_string();
    let Some(reply_tx) = pending.lock().await.remove(&key) else {
        tracing::debug!(?id, "received response for unknown ACP request");
        return;
    };

    let result = if let Some(error) = message.get("error") {
        let parsed =
            serde_json::from_value::<JsonRpcError>(error.clone()).unwrap_or(JsonRpcError {
                code: -32000,
                message: error.to_string(),
            });
        Err(parsed)
    } else {
        Ok(message.get("result").cloned().unwrap_or(Value::Null))
    };

    let _ = reply_tx.send(result);
}

async fn handle_session_update(
    message: Value,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: &Arc<Mutex<HashMap<String, String>>>,
) {
    let params = &message["params"];
    let Some(acp_session_id) = params.get("sessionId").and_then(Value::as_str) else {
        tracing::debug!(?message, "session/update did not include sessionId");
        return;
    };
    let Some(update) = params.get("update") else {
        tracing::debug!(?message, "session/update did not include update");
        return;
    };
    let Some(update_type) = update.get("sessionUpdate").and_then(Value::as_str) else {
        tracing::debug!(?update, "session/update did not include sessionUpdate kind");
        return;
    };

    match update_type {
        "agent_message_chunk" => {
            if let Some(text) = text_from_content(update.get("content")) {
                assistant_buffers
                    .lock()
                    .await
                    .entry(acp_session_id.to_string())
                    .or_default()
                    .push_str(&text);

                if let Some(local_session_id) =
                    session_map.read().await.get(acp_session_id).cloned()
                {
                    let _ = events_tx.send(RealtimeEvent::TextDelta {
                        session_id: local_session_id,
                        delta: text,
                    });
                }
            }
        }
        "user_message_chunk" => {
            tracing::debug!(?update, "ignored replayed user message chunk");
        }
        "tool_call" | "tool_call_update" => {
            let Some(local_session_id) = session_map.read().await.get(acp_session_id).cloned()
            else {
                tracing::debug!(acp_session_id, "review update for unknown ACP session");
                return;
            };
            flush_assistant_buffer(
                acp_session_id,
                events_tx,
                storage,
                session_map,
                assistant_buffers,
            )
            .await;
            let tool_input = tool_call_from_update(&local_session_id, update);
            match storage.upsert_tool_call(tool_input).await {
                Ok(tool_call) => {
                    if let Some(item) = tool_call_timeline_item(&tool_call) {
                        let _ = events_tx.send(RealtimeEvent::TimelineItemUpsert { item });
                    }
                }
                Err(error) => {
                    tracing::error!(?error, ?update, "failed to persist tool call");
                }
            }
            let artifact_input = review_artifact_from_update(&local_session_id, update);
            match storage.create_review_artifact(artifact_input).await {
                Ok(artifact) => {
                    let _ = events_tx.send(RealtimeEvent::ReviewArtifact {
                        artifact: artifact_summary(&artifact),
                    });
                }
                Err(error) => {
                    tracing::error!(?error, ?update, "failed to persist review artifact");
                }
            }
        }
        other => {
            tracing::debug!(
                update_type = other,
                "ignored unsupported ACP session update"
            );
        }
    }
}

fn tool_call_from_update(session_id: &str, update: &Value) -> UpsertToolCall {
    let status = normalized_tool_status(update);
    UpsertToolCall {
        session_id: session_id.to_string(),
        acp_tool_call_id: tool_call_id(update),
        kind: tool_call_kind(update),
        title: tool_call_title(update),
        summary: review_summary(
            update
                .get("sessionUpdate")
                .and_then(Value::as_str)
                .unwrap_or("tool_call"),
            update,
        ),
        status,
        input: update.clone(),
        output: update.get("output").cloned(),
    }
}

fn normalized_tool_status(update: &Value) -> String {
    let status = update
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or(tool_call_status::RUNNING)
        .to_ascii_lowercase();
    match status.as_str() {
        "completed" | "complete" | "succeeded" | "success" => {
            tool_call_status::COMPLETED.to_string()
        }
        "failed" | "error" => tool_call_status::FAILED.to_string(),
        _ => tool_call_status::RUNNING.to_string(),
    }
}

fn tool_call_timeline_item(row: &ToolCallRow) -> Option<TimelineItem> {
    let input = serde_json::from_str(&row.input_json).ok()?;
    let output = row
        .output_json
        .as_ref()
        .and_then(|value| serde_json::from_str(value).ok());
    Some(TimelineItem::ToolCall {
        id: row.id.clone(),
        session_id: row.session_id.clone(),
        timestamp: row.created_at.clone(),
        status: row.status.clone(),
        tool_call_id: row.acp_tool_call_id.clone(),
        tool_kind: row.kind.clone(),
        title: row.title.clone(),
        summary: row.summary.clone(),
        input,
        output,
        review_artifact_ids: Vec::new(),
    })
}

async fn flush_assistant_buffer(
    acp_session_id: &str,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: &Arc<Mutex<HashMap<String, String>>>,
) {
    let content = {
        let mut buffers = assistant_buffers.lock().await;
        let Some(buffer) = buffers.get_mut(acp_session_id) else {
            return;
        };
        if buffer.is_empty() {
            return;
        }
        std::mem::take(buffer)
    };

    let Some(local_session_id) = session_map.read().await.get(acp_session_id).cloned() else {
        tracing::debug!(acp_session_id, "assistant buffer for unknown ACP session");
        return;
    };

    match storage
        .create_message(&local_session_id, role::ASSISTANT, &content, status::IDLE)
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
            tracing::error!(?error, "failed to persist assistant message segment");
        }
    }
    let _ = events_tx.send(RealtimeEvent::AssistantMessage {
        session_id: local_session_id,
        content,
    });
}

fn review_artifact_from_update(session_id: &str, update: &Value) -> NewReviewArtifact {
    let update_type = update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .unwrap_or("session_update");
    let tool_call_id = tool_call_id(update);
    let title = tool_call_title(update);
    let kind = review_kind_for_update(update);
    let summary = review_summary(update_type, update);

    NewReviewArtifact {
        session_id: session_id.to_string(),
        tool_call_id,
        kind,
        title,
        summary,
        payload: update.clone(),
        source: "acp".to_string(),
    }
}

fn review_kind_for_update(update: &Value) -> String {
    let explicit = update
        .get("kind")
        .or_else(|| update.get("type"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if explicit.contains("diff") {
        review_artifact_kind::DIFF.to_string()
    } else if explicit.contains("markdown") {
        review_artifact_kind::MARKDOWN.to_string()
    } else if explicit.contains("terminal")
        || explicit.contains("command")
        || explicit.contains("execute")
    {
        review_artifact_kind::TERMINAL.to_string()
    } else if update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .is_some_and(|value| value.contains("tool_call"))
    {
        review_artifact_kind::TOOL_CALL.to_string()
    } else {
        review_artifact_kind::GENERIC.to_string()
    }
}

fn review_summary(update_type: &str, update: &Value) -> String {
    let status = update
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("updated");
    let kind = update
        .get("kind")
        .or_else(|| update.get("type"))
        .and_then(Value::as_str)
        .unwrap_or(update_type);
    let content = text_from_content(update.get("content"));
    match content {
        Some(text) if !text.trim().is_empty() => {
            let snippet: String = text.chars().take(120).collect();
            format!("{kind} {status}: {snippet}")
        }
        _ => format!("{kind} {status}"),
    }
}

fn artifact_summary(artifact: &ReviewArtifact) -> ReviewArtifactSummary {
    ReviewArtifactSummary {
        id: artifact.id.clone(),
        session_id: artifact.session_id.clone(),
        tool_call_id: artifact.tool_call_id.clone(),
        kind: artifact.kind.clone(),
        title: artifact.title.clone(),
        summary: artifact.summary.clone(),
        source: artifact.source.clone(),
        created_at: artifact.created_at.clone(),
    }
}

async fn handle_permission_request(
    message: Value,
    writer_tx: &mpsc::Sender<Value>,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    permission_responders: &Arc<Mutex<HashMap<String, Value>>>,
) {
    let request_id = message.get("id").cloned().unwrap_or(Value::Null);
    let acp_session_id = message["params"]
        .get("sessionId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let Some(local_session_id) = session_map.read().await.get(&acp_session_id).cloned() else {
        tracing::warn!(?message, "permission request for unknown ACP session");
        send_permission_result(request_id, cancelled_permission_response(), writer_tx).await;
        return;
    };

    match storage
        .pending_permission_for_session(&local_session_id)
        .await
    {
        Ok(Some(_)) => {
            tracing::error!(local_session_id, "duplicate pending permission request");
            send_permission_result(request_id, cancelled_permission_response(), writer_tx).await;
            let _ = events_tx.send(RealtimeEvent::Error {
                message: "Codex requested another permission while one is already pending."
                    .to_string(),
            });
            return;
        }
        Ok(None) => {}
        Err(error) => {
            tracing::error!(?error, "failed to inspect pending permission state");
            send_permission_result(request_id, cancelled_permission_response(), writer_tx).await;
            return;
        }
    }

    let params = &message["params"];
    let tool_call = params.get("toolCall").cloned().unwrap_or(Value::Null);
    let options = params.get("options").cloned().unwrap_or_else(|| json!([]));
    let input = NewPermissionRequest {
        session_id: local_session_id.clone(),
        acp_session_id,
        acp_request_id: request_id.to_string(),
        tool_call_id: tool_call_id(&tool_call),
        title: tool_call_title(&tool_call),
        kind: tool_call_kind(&tool_call),
        tool_call_json: tool_call,
        options_json: options,
    };

    match storage.create_permission_request(input).await {
        Ok(permission) => {
            permission_responders
                .lock()
                .await
                .insert(permission.id.clone(), request_id);
            let _ = events_tx.send(RealtimeEvent::SessionStatus {
                session_id: local_session_id,
                status: status::WAITING_APPROVAL.to_string(),
            });
            let _ = events_tx.send(RealtimeEvent::PermissionRequested { permission });
        }
        Err(error) => {
            tracing::error!(?error, "failed to persist permission request");
            send_permission_result(request_id, cancelled_permission_response(), writer_tx).await;
        }
    }
}

async fn send_permission_result(id: Value, result: Value, writer_tx: &mpsc::Sender<Value>) {
    let response = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    });
    let _ = writer_tx.send(response).await;
}

async fn send_error_response(
    id: Value,
    code: i64,
    message: String,
    writer_tx: &mpsc::Sender<Value>,
) {
    let response = json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    });
    let _ = writer_tx.send(response).await;
}

fn text_from_content(content: Option<&Value>) -> Option<String> {
    let content = content?;
    match content.get("type").and_then(Value::as_str) {
        Some("text") => content
            .get("text")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        _ => None,
    }
}

fn selected_permission_response(option_id: &str) -> Value {
    json!({
        "outcome": {
            "outcome": "selected",
            "optionId": option_id
        }
    })
}

fn cancelled_permission_response() -> Value {
    json!({
        "outcome": {
            "outcome": "cancelled"
        }
    })
}

fn tool_call_id(tool_call: &Value) -> Option<String> {
    tool_call
        .get("toolCallId")
        .or_else(|| tool_call.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn tool_call_title(tool_call: &Value) -> String {
    tool_call
        .get("title")
        .or_else(|| tool_call.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("Permission requested")
        .to_string()
}

fn tool_call_kind(tool_call: &Value) -> String {
    tool_call
        .get("kind")
        .or_else(|| tool_call.get("type"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string()
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, time::Duration};

    use tokio::time::timeout;

    use super::*;

    fn config_for_fake(script: PathBuf, mode: &str) -> Config {
        Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            database_url: "sqlite::memory:".to_string(),
            codex_acp_command: "python3".to_string(),
            codex_acp_args: vec![script.to_string_lossy().to_string(), mode.to_string()],
            frontend_dist: PathBuf::from("frontend/dist"),
        }
    }

    fn base_test_config() -> Config {
        Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            database_url: "sqlite::memory:".to_string(),
            codex_acp_command: "codex-acp".to_string(),
            codex_acp_args: vec![],
            frontend_dist: PathBuf::from("frontend/dist"),
        }
    }

    fn write_fake_acp(dir: &tempfile::TempDir) -> PathBuf {
        let script = dir.path().join("fake_acp.py");
        std::fs::write(
            &script,
            r#"
import json
import sys

mode = sys.argv[1]

def send(message):
    print(json.dumps(message), flush=True)

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
                "agentInfo": {
                    "name": "fake-codex",
                    "version": "0.0.0"
                }
            }
        })
    elif method == "session/new":
        send({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "sessionId": "fake-session"
            }
        })
    elif method == "session/prompt":
        if mode == "text":
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {
                            "type": "text",
                            "text": "Hello from fake ACP"
                        }
                    }
                }
            })
        elif mode == "permission":
            send({
                "jsonrpc": "2.0",
                "id": "permission-1",
                "method": "session/request_permission",
                "params": {
                    "sessionId": "fake-session",
                    "toolCall": {
                        "toolCallId": "tool-1",
                        "title": "Run fake command",
                        "kind": "execute",
                        "content": [{"type": "text", "text": "echo ok"}]
                    },
                    "options": [
                        {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                        {"optionId": "reject-once", "name": "Reject", "kind": "reject_once"},
                        {"optionId": "allow-always", "name": "Allow always", "kind": "allow_always"}
                    ]
                }
            })
            permission_response = json.loads(sys.stdin.readline())
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {
                            "type": "text",
                            "text": "Permission resolved with " + permission_response.get("result", {}).get("outcome", {}).get("optionId", "cancelled")
                        }
                    }
                }
            })
        elif mode == "nontext":
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "tool-1",
                        "title": "Ignored fake tool call",
                        "kind": "read",
                        "status": "completed"
                    }
                }
            })
        elif mode == "interleaved":
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {
                            "type": "text",
                            "text": "First segment"
                        }
                    }
                }
            })
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "tool-1",
                        "title": "Run fake tool",
                        "kind": "execute",
                        "status": "completed"
                    }
                }
            })
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {
                            "type": "text",
                            "text": "Second segment"
                        }
                    }
                }
            })

        send({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "stopReason": "end_turn"
            }
        })
"#,
        )
        .unwrap();
        script
    }

    #[tokio::test]
    async fn child_exit_during_initialize_marks_connection_failed() {
        let mut config = base_test_config();
        config.codex_acp_command = "/bin/false".to_string();
        let (events_tx, _) = broadcast::channel(16);
        let storage = test_storage().await;

        let runtime = timeout(
            Duration::from_secs(2),
            CodexRuntime::start(config, storage, events_tx.clone()),
        )
        .await
        .unwrap();

        assert_eq!(runtime.status().await.state, "failed");
    }

    #[test]
    fn realtime_event_fields_are_camel_case() {
        let event = RealtimeEvent::TextDelta {
            session_id: "session-1".to_string(),
            delta: "hello".to_string(),
        };
        let json = serde_json::to_value(event).unwrap();

        assert_eq!(json["type"], "text_delta");
        assert_eq!(json["sessionId"], "session-1");
        assert!(json.get("session_id").is_none());
    }

    #[tokio::test]
    async fn fake_acp_text_prompt_returns_text_and_broadcasts_delta() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(16);
        let runtime = CodexRuntime::start(
            config_for_fake(script, "text"),
            test_storage().await,
            events_tx.clone(),
        )
        .await;

        assert_eq!(runtime.status().await.state, "ready");

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), "local-session".to_string())
            .await;

        let mut rx = events_tx.subscribe();
        let outcome = runtime
            .prompt(acp_session_id, "Say hello".to_string())
            .await
            .unwrap();

        assert_eq!(outcome.content, "Hello from fake ACP");

        let event = timeout(Duration::from_secs(1), async move {
            loop {
                match rx.recv().await.unwrap() {
                    RealtimeEvent::TextDelta { session_id, delta } => {
                        break (session_id, delta);
                    }
                    _ => continue,
                }
            }
        })
        .await
        .unwrap();

        assert_eq!(event.0, "local-session");
        assert_eq!(event.1, "Hello from fake ACP");
    }

    #[tokio::test]
    async fn fake_acp_non_text_update_does_not_fail_prompt() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(16);
        let runtime = CodexRuntime::start(
            config_for_fake(script, "nontext"),
            test_storage().await,
            events_tx.clone(),
        )
        .await;

        assert_eq!(runtime.status().await.state, "ready");

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), "local-session".to_string())
            .await;

        let outcome = runtime
            .prompt(acp_session_id, "Trigger non-text".to_string())
            .await
            .unwrap();

        assert_eq!(outcome.content, "");
    }

    #[tokio::test]
    async fn fake_acp_tool_call_update_creates_review_artifact() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(32);
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let runtime = CodexRuntime::start(
            config_for_fake(script, "nontext"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, acp_session_id.clone())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), session.id.clone())
            .await;

        let mut rx = events_tx.subscribe();
        let outcome = runtime
            .prompt(acp_session_id, "Trigger non-text".to_string())
            .await
            .unwrap();
        assert_eq!(outcome.content, "");

        let artifact = timeout(Duration::from_secs(1), async move {
            loop {
                match rx.recv().await.unwrap() {
                    RealtimeEvent::ReviewArtifact { artifact } => break artifact,
                    _ => continue,
                }
            }
        })
        .await
        .unwrap();

        assert_eq!(artifact.session_id, session.id);
        assert_eq!(artifact.kind, review_artifact_kind::TOOL_CALL);
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
    async fn fake_acp_tool_call_flushes_pending_assistant_message() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(32);
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let runtime = CodexRuntime::start(
            config_for_fake(script, "interleaved"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, acp_session_id.clone())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), session.id.clone())
            .await;

        let mut rx = events_tx.subscribe();
        let outcome = runtime
            .prompt(acp_session_id, "Interleave".to_string())
            .await
            .unwrap();

        assert_eq!(outcome.content, "Second segment");
        assert_eq!(
            storage
                .list_messages(&session.id)
                .await
                .unwrap()
                .into_iter()
                .map(|message| message.content)
                .collect::<Vec<_>>(),
            vec!["First segment"]
        );

        let events = timeout(Duration::from_secs(1), async move {
            let mut events = Vec::new();
            while events.len() < 2 {
                match rx.recv().await.unwrap() {
                    RealtimeEvent::AssistantMessage { content, .. } => {
                        events.push(format!("message:{content}"));
                    }
                    RealtimeEvent::ReviewArtifact { artifact } => {
                        events.push(format!("artifact:{}", artifact.title));
                    }
                    _ => continue,
                }
            }
            events
        })
        .await
        .unwrap();

        assert_eq!(
            events,
            vec![
                "message:First segment".to_string(),
                "artifact:Run fake tool".to_string()
            ]
        );
    }

    #[tokio::test]
    async fn fake_acp_permission_request_waits_for_resolution() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(32);
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let runtime = CodexRuntime::start(
            config_for_fake(script, "permission"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, acp_session_id.clone())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), session.id.clone())
            .await;

        let mut rx = events_tx.subscribe();
        let prompt_runtime = runtime.clone();
        let prompt_handle = tokio::spawn(async move {
            prompt_runtime
                .prompt(acp_session_id, "Needs approval".to_string())
                .await
                .unwrap()
        });

        let permission = timeout(Duration::from_secs(1), async move {
            loop {
                match rx.recv().await.unwrap() {
                    RealtimeEvent::PermissionRequested { permission } => break permission,
                    _ => continue,
                }
            }
        })
        .await
        .unwrap();

        assert_eq!(permission.session_id, session.id);
        assert_eq!(permission.options.len(), 3);
        assert_eq!(
            storage.get_session(&session.id).await.unwrap().status,
            status::WAITING_APPROVAL
        );

        runtime
            .resolve_permission(&permission.id, "allow-once")
            .await
            .unwrap();
        let outcome = timeout(Duration::from_secs(1), prompt_handle)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(outcome.content, "Permission resolved with allow-once");
    }

    async fn test_storage() -> Storage {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        storage
    }
}
