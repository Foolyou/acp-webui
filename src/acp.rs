use std::{
    collections::{HashMap, HashSet},
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

use crate::config::Config;

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
    ConnectionStatus { status: ConnectionStatus },
    SessionStatus { session_id: String, status: String },
    TextDelta { session_id: String, delta: String },
    AssistantMessage { session_id: String, content: String },
    UnsupportedPermission { session_id: String, message: String },
    Error { message: String },
}

#[derive(Debug, Clone)]
pub struct PromptOutcome {
    pub content: String,
    pub blocked_by_permission: bool,
}

#[derive(Debug)]
pub struct CodexRuntime {
    config: Config,
    status: Arc<RwLock<ConnectionStatus>>,
    peer: RwLock<Option<Arc<JsonRpcPeer>>>,
    session_map: Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: Arc<Mutex<HashMap<String, String>>>,
    unsupported_permissions: Arc<Mutex<HashSet<String>>>,
    events_tx: broadcast::Sender<RealtimeEvent>,
}

impl CodexRuntime {
    pub async fn start(config: Config, events_tx: broadcast::Sender<RealtimeEvent>) -> Arc<Self> {
        let runtime = Arc::new(Self {
            config,
            status: Arc::new(RwLock::new(ConnectionStatus::starting())),
            peer: RwLock::new(None),
            session_map: Arc::new(RwLock::new(HashMap::new())),
            assistant_buffers: Arc::new(Mutex::new(HashMap::new())),
            unsupported_permissions: Arc::new(Mutex::new(HashSet::new())),
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
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        Arc::new(Self {
            config,
            status: Arc::new(RwLock::new(ConnectionStatus::failed(
                "Codex runtime disabled for test",
            ))),
            peer: RwLock::new(None),
            session_map: Arc::new(RwLock::new(HashMap::new())),
            assistant_buffers: Arc::new(Mutex::new(HashMap::new())),
            unsupported_permissions: Arc::new(Mutex::new(HashSet::new())),
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
        self.unsupported_permissions
            .lock()
            .await
            .remove(&acp_session_id);

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
        let blocked_by_permission = self
            .unsupported_permissions
            .lock()
            .await
            .remove(&acp_session_id);

        Ok(PromptOutcome {
            content,
            blocked_by_permission,
        })
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
            self.session_map.clone(),
            self.assistant_buffers.clone(),
            self.unsupported_permissions.clone(),
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
    _child: Mutex<Child>,
}

impl JsonRpcPeer {
    async fn spawn(
        mut child: Child,
        events_tx: broadcast::Sender<RealtimeEvent>,
        session_map: Arc<RwLock<HashMap<String, String>>>,
        assistant_buffers: Arc<Mutex<HashMap<String, String>>>,
        unsupported_permissions: Arc<Mutex<HashSet<String>>>,
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
                                    &session_map,
                                    &assistant_buffers,
                                    &unsupported_permissions,
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
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: &Arc<Mutex<HashMap<String, String>>>,
    unsupported_permissions: &Arc<Mutex<HashSet<String>>>,
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
            handle_session_update(message, events_tx, session_map, assistant_buffers).await;
        }
        "session/request_permission" => {
            handle_permission_request(
                message,
                writer_tx,
                events_tx,
                session_map,
                unsupported_permissions,
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
        other => {
            tracing::debug!(
                update_type = other,
                "ignored unsupported ACP session update"
            );
        }
    }
}

async fn handle_permission_request(
    message: Value,
    writer_tx: &mpsc::Sender<Value>,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    unsupported_permissions: &Arc<Mutex<HashSet<String>>>,
) {
    let request_id = message.get("id").cloned().unwrap_or(Value::Null);
    let acp_session_id = message["params"]
        .get("sessionId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if !acp_session_id.is_empty() {
        unsupported_permissions
            .lock()
            .await
            .insert(acp_session_id.clone());

        if let Some(local_session_id) = session_map.read().await.get(&acp_session_id).cloned() {
            let _ = events_tx.send(RealtimeEvent::UnsupportedPermission {
                session_id: local_session_id,
                message: "Codex requested permission, but approval handling is not available in this version.".to_string(),
            });
        }
    }

    let response = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "result": {
            "outcome": {
                "outcome": "cancelled"
            }
        }
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

        let runtime = timeout(
            Duration::from_secs(2),
            CodexRuntime::start(config, events_tx.clone()),
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
        let runtime = CodexRuntime::start(config_for_fake(script, "text"), events_tx.clone()).await;

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
        assert!(!outcome.blocked_by_permission);

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
        let runtime =
            CodexRuntime::start(config_for_fake(script, "nontext"), events_tx.clone()).await;

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
        assert!(!outcome.blocked_by_permission);
    }
}
