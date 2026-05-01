use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc,
    },
};

use anyhow::{anyhow, Context};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::{broadcast, mpsc, oneshot, Mutex, RwLock},
};

const DISPLAY_IMAGE_GUIDANCE: &str = "This client can render workspace images inline. When you create, edit, find, capture, or reference an image file that the user should inspect, call the display_image tool with the image path. Prefer showing the image inline over only telling the user its directory or file path.";
const MAX_DISPLAY_IMAGE_BYTES: u64 = 5 * 1024 * 1024;
const SUPPORTED_DISPLAY_IMAGE_MIME_TYPES: &[&str] =
    &["image/png", "image/jpeg", "image/webp", "image/gif"];

use crate::{
    config::{AgentConfig, Config, ResolvedAgentLaunchProfile, CODEX_AGENT_ID},
    models::{
        permission_mode, permission_status, review_artifact_kind, role, status,
        text_fallback_from_blocks, tool_call_status, ActiveTurn, AgentControl, AgentPermissionMode,
        AgentPromptCapabilities, AgentSessionCapabilities, MessageContentBlock, NewReviewArtifact,
        PermissionRequest, QueuedPrompt, ReviewArtifact, ReviewArtifactSummary,
        SessionConfigOption, SessionConfigState, SessionContinuity, SessionCurrentModel,
        TimelineItem, ToolCallRow, UpsertToolCall,
    },
    storage::{NewPermissionRequest, Storage},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub state: String,
    pub message: Option<String>,
    pub agent_info: Option<Value>,
    pub prompt_capabilities: AgentPromptCapabilities,
    pub session_capabilities: AgentSessionCapabilities,
}

impl ConnectionStatus {
    fn idle(agent: &AgentConfig) -> Self {
        Self {
            state: "idle".to_string(),
            message: Some(format!("{} runtime has not started", agent.title)),
            agent_info: None,
            prompt_capabilities: AgentPromptCapabilities::none(),
            session_capabilities: AgentSessionCapabilities::none(),
        }
    }

    fn starting(agent: &AgentConfig) -> Self {
        Self {
            state: "starting".to_string(),
            message: Some(format!("Starting {}", agent.title)),
            agent_info: None,
            prompt_capabilities: AgentPromptCapabilities::none(),
            session_capabilities: AgentSessionCapabilities::none(),
        }
    }

    fn ready(
        agent_info: Option<Value>,
        prompt_capabilities: AgentPromptCapabilities,
        session_capabilities: AgentSessionCapabilities,
    ) -> Self {
        Self {
            state: "ready".to_string(),
            message: None,
            agent_info,
            prompt_capabilities,
            session_capabilities,
        }
    }

    fn failed(message: impl Into<String>) -> Self {
        Self {
            state: "failed".to_string(),
            message: Some(message.into()),
            agent_info: None,
            prompt_capabilities: AgentPromptCapabilities::none(),
            session_capabilities: AgentSessionCapabilities::none(),
        }
    }

    fn disabled(message: impl Into<String>) -> Self {
        Self {
            state: "disabled".to_string(),
            message: Some(message.into()),
            agent_info: None,
            prompt_capabilities: AgentPromptCapabilities::none(),
            session_capabilities: AgentSessionCapabilities::none(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeStatus {
    pub id: String,
    pub provider_id: String,
    pub title: String,
    pub enabled: bool,
    pub status: ConnectionStatus,
    pub permission_modes: Vec<AgentPermissionModeStatus>,
    pub launch_controls: Vec<AgentControl>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPermissionModeStatus {
    pub id: String,
    pub label: String,
    pub description: String,
    pub risk_level: String,
    pub status: ConnectionStatus,
}

impl AgentPermissionModeStatus {
    fn from_mode(mode: &AgentPermissionMode, status: ConnectionStatus) -> Self {
        Self {
            id: mode.id.clone(),
            label: mode.label.clone(),
            description: mode.description.clone(),
            risk_level: mode.risk_level.clone(),
            status,
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
    AgentConnectionStatus {
        agent_id: String,
        permission_mode: String,
        status: ConnectionStatus,
    },
    SessionStatus {
        session_id: String,
        status: String,
    },
    ActiveTurnUpdated {
        session_id: String,
        status: String,
        active_turn: Option<ActiveTurn>,
    },
    QueuedPromptsUpdated {
        session_id: String,
        queued_prompts: Vec<QueuedPrompt>,
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
        active_permission: Option<PermissionRequest>,
        pending_approval_count: i64,
        queued_approval_count: i64,
    },
    PermissionResolved {
        session_id: String,
        permission_id: String,
        next_permission: Option<PermissionRequest>,
        pending_approval_count: i64,
        queued_approval_count: i64,
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
    SessionRestoreStarted {
        session_id: String,
    },
    SessionRestoreSucceeded {
        session_id: String,
    },
    SessionRestoreFailed {
        session_id: String,
        message: String,
    },
    SessionConfigUpdated {
        session_id: String,
        config_options: Option<Vec<SessionConfigOption>>,
        current_model: Option<SessionCurrentModel>,
    },
}

#[derive(Debug, Clone)]
pub struct PromptOutcome {
    pub content: String,
    pub message_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewSessionOutcome {
    pub session_id: String,
    pub config_options: Option<Vec<SessionConfigOption>>,
}

#[derive(Debug)]
pub struct AgentRuntime {
    agent: AgentConfig,
    permission_mode: String,
    storage: Storage,
    status: Arc<RwLock<ConnectionStatus>>,
    peer: RwLock<Option<Arc<JsonRpcPeer>>>,
    session_map: Arc<RwLock<HashMap<String, String>>>,
    restore_session_map: Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: Arc<Mutex<HashMap<String, String>>>,
    assistant_message_ids: Arc<Mutex<HashMap<String, String>>>,
    events_tx: broadcast::Sender<RealtimeEvent>,
}

pub type CodexRuntime = AgentRuntime;

impl AgentRuntime {
    #[cfg(test)]
    pub async fn start(
        config: Config,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        let agent = config
            .agent_configs()
            .into_iter()
            .find(|agent| agent.id == CODEX_AGENT_ID)
            .expect("codex agent config is always present");
        Self::start_for_agent(agent, storage, events_tx).await
    }

    #[cfg(test)]
    pub async fn start_for_agent(
        agent: AgentConfig,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        let runtime = Self::starting_for_agent(
            agent,
            permission_mode::MANUAL.to_string(),
            storage,
            events_tx,
        );
        runtime.start_connection().await;
        runtime
    }

    fn starting_for_agent(
        agent: AgentConfig,
        permission_mode: String,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        Arc::new(Self {
            status: Arc::new(RwLock::new(ConnectionStatus::starting(&agent))),
            agent,
            permission_mode,
            storage,
            peer: RwLock::new(None),
            session_map: Arc::new(RwLock::new(HashMap::new())),
            restore_session_map: Arc::new(RwLock::new(HashMap::new())),
            assistant_buffers: Arc::new(Mutex::new(HashMap::new())),
            assistant_message_ids: Arc::new(Mutex::new(HashMap::new())),
            events_tx,
        })
    }

    async fn start_connection(&self) {
        self.emit_status().await;

        if let Err(error) = self.connect().await {
            tracing::error!(
                ?error,
                agent_id = self.agent.id.as_str(),
                "failed to initialize ACP agent"
            );
            *self.status.write().await = ConnectionStatus::failed(error.to_string());
            self.emit_status().await;
        }
    }

    #[cfg(test)]
    pub fn failed_for_tests(
        config: Config,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        let agent = config
            .agent_configs()
            .into_iter()
            .find(|agent| agent.id == CODEX_AGENT_ID)
            .expect("codex agent config is always present");
        Self::failed_for_agent_tests(agent, storage, events_tx, "Codex runtime disabled for test")
    }

    #[cfg(test)]
    pub fn failed_for_agent_tests(
        agent: AgentConfig,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
        message: impl Into<String>,
    ) -> Arc<Self> {
        Arc::new(Self {
            agent,
            permission_mode: permission_mode::MANUAL.to_string(),
            storage,
            status: Arc::new(RwLock::new(ConnectionStatus::failed(message))),
            peer: RwLock::new(None),
            session_map: Arc::new(RwLock::new(HashMap::new())),
            restore_session_map: Arc::new(RwLock::new(HashMap::new())),
            assistant_buffers: Arc::new(Mutex::new(HashMap::new())),
            assistant_message_ids: Arc::new(Mutex::new(HashMap::new())),
            events_tx,
        })
    }

    #[cfg(test)]
    pub fn ready_for_tests(
        config: Config,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
        session_capabilities: AgentSessionCapabilities,
    ) -> Arc<Self> {
        let agent = config
            .agent_configs()
            .into_iter()
            .find(|agent| agent.id == CODEX_AGENT_ID)
            .expect("codex agent config is always present");
        Self::ready_for_agent_tests(agent, storage, events_tx, session_capabilities)
    }

    #[cfg(test)]
    pub fn ready_for_agent_tests(
        agent: AgentConfig,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
        session_capabilities: AgentSessionCapabilities,
    ) -> Arc<Self> {
        let agent_name = agent.id.clone();
        Arc::new(Self {
            agent,
            permission_mode: permission_mode::MANUAL.to_string(),
            storage,
            status: Arc::new(RwLock::new(ConnectionStatus::ready(
                Some(json!({"name": format!("test-{agent_name}")})),
                AgentPromptCapabilities::none(),
                session_capabilities,
            ))),
            peer: RwLock::new(None),
            session_map: Arc::new(RwLock::new(HashMap::new())),
            restore_session_map: Arc::new(RwLock::new(HashMap::new())),
            assistant_buffers: Arc::new(Mutex::new(HashMap::new())),
            assistant_message_ids: Arc::new(Mutex::new(HashMap::new())),
            events_tx,
        })
    }

    pub async fn status(&self) -> ConnectionStatus {
        self.status.read().await.clone()
    }

    pub fn agent(&self) -> &AgentConfig {
        &self.agent
    }

    #[cfg(test)]
    pub fn permission_mode(&self) -> &str {
        &self.permission_mode
    }

    pub async fn ensure_ready(&self) -> anyhow::Result<Arc<JsonRpcPeer>> {
        if self.status.read().await.state != "ready" {
            let status = self.status.read().await.clone();
            return Err(anyhow!(
                "{} connection is not ready{}",
                self.agent.title,
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
            .ok_or_else(|| anyhow!("{} connection is not available", self.agent.title))
    }

    pub async fn new_session(&self, cwd: String) -> anyhow::Result<NewSessionOutcome> {
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
        let config_options = parse_config_options(result.get("configOptions"));

        Ok(NewSessionOutcome {
            session_id: acp_session_id,
            config_options,
        })
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

    pub async fn session_capabilities(&self) -> AgentSessionCapabilities {
        self.status.read().await.session_capabilities.clone()
    }

    pub async fn prompt_capabilities(&self) -> AgentPromptCapabilities {
        self.status.read().await.prompt_capabilities.clone()
    }

    pub async fn can_load_session(&self) -> bool {
        self.session_capabilities().await.load_session
    }

    pub async fn runtime_session_continuity(
        &self,
        acp_session_id: Option<&str>,
        external_session_id: Option<&str>,
    ) -> SessionContinuity {
        if self.has_registered_session(acp_session_id).await {
            return SessionContinuity::live();
        }

        let has_external_session_id = external_session_id.or(acp_session_id).is_some();
        let capabilities = self.session_capabilities().await;
        if has_external_session_id && capabilities.load_session {
            SessionContinuity::loadable("Restore this session before sending another prompt.")
        } else if has_external_session_id && capabilities.resume_session {
            SessionContinuity::resumable(
                "This agent advertises session/resume, but this version only enables ACP session/load restores.",
            )
        } else if has_external_session_id {
            SessionContinuity::view_only(format!(
                "This session history is available for review, but the live {} runtime context is not available. Start a new session to continue working.",
                self.agent.title
            ))
        } else {
            SessionContinuity::view_only("Session is missing an agent session id.")
        }
    }

    pub async fn load_session(
        &self,
        acp_session_id: String,
        local_session_id: String,
        cwd: String,
    ) -> anyhow::Result<Option<Vec<SessionConfigOption>>> {
        let peer = self.ensure_ready().await?;
        if !self.session_capabilities().await.load_session {
            return Err(anyhow!(
                "{} ACP does not advertise session/load support",
                self.agent.title
            ));
        }

        self.restore_session_map
            .write()
            .await
            .insert(acp_session_id.clone(), local_session_id.clone());
        let result = peer
            .request(
                "session/load",
                json!({
                    "sessionId": acp_session_id,
                    "cwd": cwd,
                    "mcpServers": []
                }),
            )
            .await;

        if result.is_ok() {
            flush_assistant_buffer_for_session(
                &acp_session_id,
                &local_session_id,
                &self.events_tx,
                &self.storage,
                &self.assistant_buffers,
                &self.assistant_message_ids,
                true,
                false,
            )
            .await;
        }
        self.restore_session_map
            .write()
            .await
            .remove(&acp_session_id);

        let result = result?;
        let config_options = parse_config_options(result.get("configOptions"));
        self.register_session(acp_session_id, local_session_id)
            .await;
        Ok(config_options)
    }

    pub async fn set_config_option(
        &self,
        acp_session_id: String,
        config_id: String,
        value: String,
    ) -> anyhow::Result<SessionConfigState> {
        let peer = self.ensure_ready().await?;
        let result = peer
            .request(
                "session/set_config_option",
                json!({
                    "sessionId": acp_session_id,
                    "configId": config_id,
                    "value": value
                }),
            )
            .await?;
        let config_options =
            parse_config_options(result.get("configOptions")).ok_or_else(|| {
                anyhow!("session/set_config_option response did not include configOptions")
            })?;
        let current_model = crate::storage::derive_current_model(&config_options);
        Ok(SessionConfigState {
            config_options: Some(config_options),
            current_model,
        })
    }

    pub async fn prompt(
        &self,
        acp_session_id: String,
        prompt_blocks: Vec<MessageContentBlock>,
    ) -> anyhow::Result<PromptOutcome> {
        let peer = self.ensure_ready().await?;
        self.assistant_buffers
            .lock()
            .await
            .insert(acp_session_id.clone(), String::new());
        self.assistant_message_ids
            .lock()
            .await
            .remove(&acp_session_id);
        let prompt_blocks = if self
            .status
            .read()
            .await
            .prompt_capabilities
            .embedded_context
        {
            prompt_blocks_with_display_image_guidance(&prompt_blocks)
        } else {
            prompt_blocks
        };

        let result = peer
            .request(
                "session/prompt",
                json!({
                    "sessionId": acp_session_id,
                    "prompt": acp_content_blocks(&prompt_blocks)
                }),
            )
            .await;

        let content = self
            .assistant_buffers
            .lock()
            .await
            .remove(&acp_session_id)
            .unwrap_or_default();
        let message_id = self
            .assistant_message_ids
            .lock()
            .await
            .remove(&acp_session_id);

        match result {
            Ok(_) => {
                if let Some(message_id) = &message_id {
                    if let Err(error) = self
                        .storage
                        .update_message_status(message_id, status::IDLE)
                        .await
                    {
                        tracing::error!(?error, "failed to mark assistant message idle");
                    }
                }
                Ok(PromptOutcome {
                    content,
                    message_id,
                })
            }
            Err(error) => {
                if let Some(message_id) = &message_id {
                    if let Err(update_error) = self
                        .storage
                        .update_message_status(message_id, status::FAILED)
                        .await
                    {
                        tracing::error!(?update_error, "failed to mark assistant message failed");
                    }
                }
                Err(error)
            }
        }
    }

    pub async fn stop_session_turn(&self, acp_session_id: String) -> anyhow::Result<()> {
        let peer = self.ensure_ready().await?;
        peer.request(
            "session/cancel",
            json!({
                "sessionId": acp_session_id
            }),
        )
        .await
        .map(|_| ())
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
        let active_permission = self
            .storage
            .pending_permission_for_session(&permission.session_id)
            .await?
            .ok_or_else(|| anyhow!("permission request is not pending"))?;
        anyhow::ensure!(
            active_permission.id == permission_id,
            "permission request is queued behind another approval"
        );
        let _option = permission
            .options
            .iter()
            .find(|candidate| candidate.option_id == option_id)
            .ok_or_else(|| anyhow!("permission option was not found"))?;

        let peer = self.ensure_ready().await?;
        peer.respond_to_permission(permission_id, selected_permission_response(option_id))
            .await?;
        self.storage
            .resolve_permission_request(permission_id, option_id)
            .await?;
        let pending_permissions = self
            .storage
            .pending_permissions_for_session(&permission.session_id)
            .await?;
        let pending_approval_count = pending_permissions.len() as i64;
        let queued_approval_count = queued_approval_count(pending_approval_count);
        let next_permission = pending_permissions.first().cloned();
        let next_status = if pending_approval_count > 0 {
            status::WAITING_APPROVAL
        } else {
            status::RUNNING
        };
        self.storage
            .update_session_status(&permission.session_id, next_status)
            .await?;
        let resolved = self.storage.get_permission_request(permission_id).await?;
        let _ = self.events_tx.send(RealtimeEvent::PermissionResolved {
            session_id: permission.session_id.clone(),
            permission_id: permission_id.to_string(),
            next_permission,
            pending_approval_count,
            queued_approval_count,
        });
        let _ = self.events_tx.send(RealtimeEvent::SessionStatus {
            session_id: permission.session_id,
            status: next_status.to_string(),
        });
        Ok(resolved)
    }

    pub async fn cancel_pending_permissions_for_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<String>> {
        let permissions = self
            .storage
            .pending_permissions_for_session(session_id)
            .await?;
        if permissions.is_empty() {
            return Ok(Vec::new());
        }

        let peer = self.peer.read().await.clone();
        let mut cancelled = Vec::with_capacity(permissions.len());
        for permission in permissions {
            if let Some(peer) = &peer {
                if let Err(error) = peer
                    .respond_to_permission(&permission.id, cancelled_permission_response())
                    .await
                {
                    tracing::warn!(
                        ?error,
                        permission_id = permission.id.as_str(),
                        "failed to send cancelled permission response"
                    );
                }
            }
            self.storage
                .cancel_permission_request(&permission.id)
                .await?;
            let _ = self.events_tx.send(RealtimeEvent::PermissionResolved {
                session_id: session_id.to_string(),
                permission_id: permission.id.clone(),
                next_permission: None,
                pending_approval_count: 0,
                queued_approval_count: 0,
            });
            cancelled.push(permission.id);
        }
        Ok(cancelled)
    }

    async fn connect(&self) -> anyhow::Result<()> {
        let launch_command = command_path_for_spawn(&self.agent.command);
        let mut command = Command::new(&launch_command);
        command
            .args(&self.agent.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let child = command.spawn().with_context(|| {
            format!(
                "failed to launch `{}` with args {:?}",
                launch_command.display(),
                self.agent.args
            )
        })?;

        let peer = JsonRpcPeer::spawn(
            child,
            self.events_tx.clone(),
            self.storage.clone(),
            self.session_map.clone(),
            self.restore_session_map.clone(),
            self.assistant_buffers.clone(),
            self.assistant_message_ids.clone(),
        )
        .await?;

        let result = peer
            .request(
                "initialize",
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        "fs": {
                            "readTextFile": true
                        },
                        "_meta": {
                            "acp-webui": {
                                "displayImage": {
                                    "name": "display_image",
                                    "description": DISPLAY_IMAGE_GUIDANCE,
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {
                                            "path": {
                                                "type": "string",
                                                "description": "Workspace-contained image path to display inline."
                                            },
                                            "title": {
                                                "type": "string",
                                                "description": "Optional concise image title."
                                            },
                                            "caption": {
                                                "type": "string",
                                                "description": "Optional short caption for the user."
                                            }
                                        },
                                        "required": ["path"]
                                    }
                                }
                            }
                        }
                    },
                    "clientInfo": {
                        "name": "acp-webui",
                        "title": "ACP Web UI",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                }),
            )
            .await?;

        let agent_info = result.get("agentInfo").cloned();
        let prompt_capabilities = prompt_capabilities_from_initialize(&result);
        let session_capabilities = session_capabilities_from_initialize(&result);
        *self.status.write().await =
            ConnectionStatus::ready(agent_info, prompt_capabilities, session_capabilities);
        *self.peer.write().await = Some(peer);
        self.emit_status().await;

        Ok(())
    }

    async fn emit_status(&self) {
        let status = self.status().await;
        let _ = self.events_tx.send(RealtimeEvent::AgentConnectionStatus {
            agent_id: self.agent.id.clone(),
            permission_mode: self.permission_mode.clone(),
            status: status.clone(),
        });
        if self.agent.id == CODEX_AGENT_ID && self.permission_mode == permission_mode::MANUAL {
            let _ = self
                .events_tx
                .send(RealtimeEvent::ConnectionStatus { status });
        }
    }
}

#[derive(Debug)]
struct AgentRuntimeEntry {
    config: AgentConfig,
    runtime: RwLock<Option<Arc<AgentRuntime>>>,
    start_lock: Mutex<()>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct AgentRuntimeKey {
    agent_id: String,
    launch_profile_key: String,
}

impl AgentRuntimeKey {
    fn new(agent_id: impl Into<String>, launch_profile_key: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            launch_profile_key: launch_profile_key.into(),
        }
    }
}

#[derive(Debug)]
pub struct AgentRuntimeManager {
    agents: HashMap<String, AgentConfig>,
    entries: HashMap<AgentRuntimeKey, AgentRuntimeEntry>,
    order: Vec<String>,
    default_agent_id: String,
    storage: Storage,
    events_tx: broadcast::Sender<RealtimeEvent>,
}

impl AgentRuntimeManager {
    pub async fn start(
        config: &Config,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
    ) -> Arc<Self> {
        let mut agents = HashMap::new();
        let mut entries = HashMap::new();
        let mut order = Vec::new();
        for agent in config.agent_configs() {
            order.push(agent.id.clone());
            for profile in &agent.launch_profiles {
                let runtime_config = agent
                    .runtime_config_for_permission_mode(&profile.key)
                    .expect("built-in launch profile mapping is valid");
                entries.insert(
                    AgentRuntimeKey::new(&agent.id, &profile.key),
                    AgentRuntimeEntry {
                        config: runtime_config,
                        runtime: RwLock::new(None),
                        start_lock: Mutex::new(()),
                    },
                );
            }
            agents.insert(agent.id.clone(), agent);
        }

        Arc::new(Self {
            agents,
            entries,
            order,
            default_agent_id: config.default_agent_id().to_string(),
            storage,
            events_tx,
        })
    }

    #[cfg(test)]
    pub fn for_tests(
        config: &Config,
        storage: Storage,
        events_tx: broadcast::Sender<RealtimeEvent>,
        statuses: HashMap<String, Arc<AgentRuntime>>,
    ) -> Arc<Self> {
        let mut agents = HashMap::new();
        let mut entries = HashMap::new();
        let mut order = Vec::new();
        for agent in config.agent_configs() {
            order.push(agent.id.clone());
            for profile in &agent.launch_profiles {
                let runtime = statuses
                    .get(&format!("{}:{}", agent.id, profile.key))
                    .or_else(|| {
                        (profile.permission_mode == permission_mode::MANUAL)
                            .then(|| statuses.get(&agent.id))
                            .flatten()
                    })
                    .cloned();
                let runtime_config = agent
                    .runtime_config_for_permission_mode(&profile.key)
                    .expect("built-in launch profile mapping is valid");
                entries.insert(
                    AgentRuntimeKey::new(&agent.id, &profile.key),
                    AgentRuntimeEntry {
                        runtime: RwLock::new(runtime),
                        start_lock: Mutex::new(()),
                        config: runtime_config,
                    },
                );
            }
            agents.insert(agent.id.clone(), agent);
        }

        Arc::new(Self {
            agents,
            entries,
            order,
            default_agent_id: config.default_agent_id().to_string(),
            storage,
            events_tx,
        })
    }

    pub fn default_agent_id(&self) -> &str {
        &self.default_agent_id
    }

    pub fn resolve_agent_id(&self, agent_id: Option<&str>) -> anyhow::Result<String> {
        let resolved = agent_id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(self.default_agent_id());
        let agent = self
            .agents
            .get(resolved)
            .ok_or_else(|| anyhow!("Unknown agent id `{resolved}`"))?;
        if !agent.enabled {
            return Err(anyhow!("{} is disabled", agent.title));
        }
        Ok(resolved.to_string())
    }

    pub fn resolve_permission_mode(
        &self,
        agent_id: &str,
        requested_permission_mode: Option<&str>,
    ) -> anyhow::Result<String> {
        let mode = requested_permission_mode
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(permission_mode::MANUAL);
        if !permission_mode::is_known(mode) {
            return Err(anyhow!("Unknown permission mode `{mode}`"));
        }
        let agent = self
            .agents
            .get(agent_id)
            .ok_or_else(|| anyhow!("Unknown agent id `{agent_id}`"))?;
        if !agent.supports_permission_mode(mode) {
            return Err(anyhow!(
                "{} does not support permission mode `{mode}`",
                agent.title
            ));
        }
        Ok(mode.to_string())
    }

    pub fn resolve_launch_profile(
        &self,
        agent_id: &str,
        requested_permission_mode: Option<&str>,
        values: Option<&std::collections::BTreeMap<String, String>>,
    ) -> anyhow::Result<ResolvedAgentLaunchProfile> {
        let agent = self
            .agents
            .get(agent_id)
            .ok_or_else(|| anyhow!("Unknown agent id `{agent_id}`"))?;
        agent.resolve_launch_profile(requested_permission_mode, values)
    }

    #[cfg(test)]
    pub async fn runtime(&self, agent_id: &str) -> anyhow::Result<Arc<AgentRuntime>> {
        self.runtime_for_permission_mode(agent_id, permission_mode::MANUAL)
            .await
    }

    #[allow(dead_code)]
    pub async fn runtime_for_permission_mode(
        &self,
        agent_id: &str,
        permission_mode: &str,
    ) -> anyhow::Result<Arc<AgentRuntime>> {
        let key = self.runtime_key_for_permission_mode(agent_id, permission_mode)?;
        let entry = self.entries.get(&key).ok_or_else(|| {
            anyhow!("Unknown agent id `{agent_id}` or permission mode `{permission_mode}`")
        })?;
        if !entry.config.enabled {
            return Err(anyhow!("{} is disabled", entry.config.title));
        }
        entry
            .runtime
            .read()
            .await
            .clone()
            .ok_or_else(|| anyhow!("{} runtime has not started", entry.config.title))
    }

    pub async fn runtime_for_launch_profile(
        &self,
        agent_id: &str,
        launch_profile_key: &str,
    ) -> anyhow::Result<Arc<AgentRuntime>> {
        let key = self
            .entry_key_for_launch_profile(agent_id, launch_profile_key)
            .or_else(|_| self.runtime_key_for_permission_mode(agent_id, launch_profile_key))?;
        let entry = self.entries.get(&key).ok_or_else(|| {
            anyhow!("Unknown agent id `{agent_id}` or launch profile `{launch_profile_key}`")
        })?;
        if !entry.config.enabled {
            return Err(anyhow!("{} is disabled", entry.config.title));
        }
        entry
            .runtime
            .read()
            .await
            .clone()
            .ok_or_else(|| anyhow!("{} runtime has not started", entry.config.title))
    }

    #[cfg(test)]
    pub async fn runtime_for_use(&self, agent_id: &str) -> anyhow::Result<Arc<AgentRuntime>> {
        self.runtime_for_permission_mode_use(agent_id, permission_mode::MANUAL)
            .await
    }

    #[allow(dead_code)]
    pub async fn runtime_for_permission_mode_use(
        &self,
        agent_id: &str,
        permission_mode: &str,
    ) -> anyhow::Result<Arc<AgentRuntime>> {
        let key = self.runtime_key_for_permission_mode(agent_id, permission_mode)?;
        self.runtime_for_key_use(key, permission_mode.to_string())
            .await
    }

    pub async fn runtime_for_launch_profile_use(
        &self,
        agent_id: &str,
        profile: &ResolvedAgentLaunchProfile,
    ) -> anyhow::Result<Arc<AgentRuntime>> {
        self.runtime_for_key_use(
            AgentRuntimeKey::new(agent_id, &profile.key),
            profile.permission_mode.clone(),
        )
        .await
    }

    pub async fn runtime_for_launch_profile_key_use(
        &self,
        agent_id: &str,
        launch_profile_key: &str,
        permission_mode: &str,
    ) -> anyhow::Result<Arc<AgentRuntime>> {
        let key = self
            .entry_key_for_launch_profile(agent_id, launch_profile_key)
            .or_else(|_| self.runtime_key_for_permission_mode(agent_id, permission_mode))?;
        self.runtime_for_key_use(key, permission_mode.to_string())
            .await
    }

    async fn runtime_for_key_use(
        &self,
        key: AgentRuntimeKey,
        permission_mode: String,
    ) -> anyhow::Result<Arc<AgentRuntime>> {
        let entry = self.entries.get(&key).ok_or_else(|| {
            anyhow!(
                "Unknown agent id `{}` or launch profile `{}`",
                key.agent_id,
                key.launch_profile_key
            )
        })?;
        if !entry.config.enabled {
            return Err(anyhow!("{} is disabled", entry.config.title));
        }

        if let Some(runtime) = entry.runtime.read().await.clone() {
            match runtime.status().await.state.as_str() {
                "ready" => return Ok(runtime),
                "starting" => {
                    let _guard = entry.start_lock.lock().await;
                    if let Some(runtime) = entry.runtime.read().await.clone() {
                        if runtime.status().await.state != "failed" {
                            return Ok(runtime);
                        }
                    }
                }
                "failed" => {}
                _ => return Ok(runtime),
            }
        }

        let _guard = entry.start_lock.lock().await;
        if let Some(runtime) = entry.runtime.read().await.clone() {
            let state = runtime.status().await.state;
            if state != "failed" {
                return Ok(runtime);
            }
        }

        let runtime = AgentRuntime::starting_for_agent(
            entry.config.clone(),
            permission_mode,
            self.storage.clone(),
            self.events_tx.clone(),
        );
        *entry.runtime.write().await = Some(runtime.clone());
        runtime.start_connection().await;
        Ok(runtime)
    }

    pub async fn statuses(&self) -> Vec<AgentRuntimeStatus> {
        let mut statuses = Vec::with_capacity(self.order.len());
        for agent_id in &self.order {
            let Some(agent) = self.agents.get(agent_id) else {
                continue;
            };
            let status = if !agent.enabled {
                ConnectionStatus::disabled(format!("{} is disabled", agent.title))
            } else {
                self.status_for_mode(agent, permission_mode::MANUAL).await
            };
            let mut permission_modes = Vec::with_capacity(agent.permission_modes.len());
            for mode in &agent.permission_modes {
                let mode_status = if !agent.enabled {
                    ConnectionStatus::disabled(format!("{} is disabled", agent.title))
                } else {
                    self.status_for_mode(agent, &mode.id).await
                };
                permission_modes.push(AgentPermissionModeStatus::from_mode(mode, mode_status));
            }
            statuses.push(AgentRuntimeStatus {
                id: agent.id.clone(),
                provider_id: agent.provider_id.clone(),
                title: agent.title.clone(),
                enabled: agent.enabled,
                status,
                permission_modes,
                launch_controls: agent.launch_controls.clone(),
            });
        }
        statuses
    }

    pub async fn codex_status(&self) -> ConnectionStatus {
        match self.agents.get(CODEX_AGENT_ID) {
            Some(agent) if !agent.enabled => ConnectionStatus::disabled("Codex is disabled"),
            Some(agent) => self.status_for_mode(agent, permission_mode::MANUAL).await,
            None => ConnectionStatus::failed("Codex runtime is not available"),
        }
    }

    async fn status_for_mode(&self, agent: &AgentConfig, mode: &str) -> ConnectionStatus {
        let key = match agent.default_launch_profile_key_for_permission_mode(mode) {
            Some(profile_key) => AgentRuntimeKey::new(&agent.id, profile_key),
            None => {
                return ConnectionStatus::failed(format!(
                    "{} permission mode `{mode}` is not available",
                    agent.title
                ));
            }
        };
        match self.entries.get(&key) {
            Some(entry) => match entry.runtime.read().await.clone() {
                Some(runtime) => runtime.status().await,
                None => ConnectionStatus::idle(&entry.config),
            },
            None => ConnectionStatus::failed(format!(
                "{} permission mode `{mode}` is not available",
                agent.title
            )),
        }
    }

    fn runtime_key_for_permission_mode(
        &self,
        agent_id: &str,
        permission_mode: &str,
    ) -> anyhow::Result<AgentRuntimeKey> {
        let agent = self
            .agents
            .get(agent_id)
            .ok_or_else(|| anyhow!("Unknown agent id `{agent_id}`"))?;
        let profile_key = agent
            .default_launch_profile_key_for_permission_mode(permission_mode)
            .ok_or_else(|| {
                anyhow!(
                    "{} permission mode `{permission_mode}` is not available",
                    agent.title
                )
            })?;
        Ok(AgentRuntimeKey::new(agent_id, profile_key))
    }

    fn entry_key_for_launch_profile(
        &self,
        agent_id: &str,
        launch_profile_key: &str,
    ) -> anyhow::Result<AgentRuntimeKey> {
        let key = AgentRuntimeKey::new(agent_id, launch_profile_key);
        if self.entries.contains_key(&key) {
            Ok(key)
        } else {
            Err(anyhow!(
                "Unknown agent id `{agent_id}` or launch profile `{launch_profile_key}`"
            ))
        }
    }
}

type PendingResult = Result<Value, JsonRpcError>;

#[derive(Debug, Clone, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl std::fmt::Display for JsonRpcError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "JSON-RPC error {}: {}", self.code, self.message)?;
        if let Some(details) = self
            .data
            .as_ref()
            .and_then(|data| data.get("details"))
            .and_then(Value::as_str)
        {
            write!(formatter, " ({details})")?;
        }
        Ok(())
    }
}

impl std::error::Error for JsonRpcError {}

fn session_capabilities_from_initialize(result: &Value) -> AgentSessionCapabilities {
    let agent_capabilities = result.get("agentCapabilities").unwrap_or(&Value::Null);
    let session_capabilities = agent_capabilities
        .get("sessionCapabilities")
        .unwrap_or(&Value::Null);

    AgentSessionCapabilities {
        load_session: agent_capabilities
            .get("loadSession")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        resume_session: capability_field_enabled(session_capabilities.get("resume")),
        list_sessions: capability_field_enabled(session_capabilities.get("list")),
        close_session: capability_field_enabled(session_capabilities.get("close")),
    }
}

fn prompt_capabilities_from_initialize(result: &Value) -> AgentPromptCapabilities {
    let prompt_capabilities = result
        .get("agentCapabilities")
        .and_then(|capabilities| capabilities.get("promptCapabilities"))
        .unwrap_or(&Value::Null);

    AgentPromptCapabilities {
        image: prompt_capabilities
            .get("image")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        audio: prompt_capabilities
            .get("audio")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        embedded_context: prompt_capabilities
            .get("embeddedContext")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

fn capability_field_enabled(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(enabled)) => *enabled,
        Some(Value::Null) | None => false,
        Some(_) => true,
    }
}

fn parse_config_options(value: Option<&Value>) -> Option<Vec<SessionConfigOption>> {
    let Some(value) = value else {
        return None;
    };
    if !value.is_array() {
        tracing::warn!(?value, "ACP configOptions was not an array");
        return None;
    }
    match serde_json::from_value::<Vec<SessionConfigOption>>(value.clone()) {
        Ok(options) => Some(options),
        Err(error) => {
            tracing::warn!(?error, ?value, "failed to parse ACP configOptions");
            None
        }
    }
}

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
        restore_session_map: Arc<RwLock<HashMap<String, String>>>,
        assistant_buffers: Arc<Mutex<HashMap<String, String>>>,
        assistant_message_ids: Arc<Mutex<HashMap<String, String>>>,
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
                                    &restore_session_map,
                                    &assistant_buffers,
                                    &assistant_message_ids,
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
            data: None,
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
    restore_session_map: &Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: &Arc<Mutex<HashMap<String, String>>>,
    assistant_message_ids: &Arc<Mutex<HashMap<String, String>>>,
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
            handle_session_update(
                message,
                events_tx,
                storage,
                session_map,
                restore_session_map,
                assistant_buffers,
                assistant_message_ids,
            )
            .await;
        }
        "session/request_permission" => {
            handle_permission_request(
                message,
                writer_tx,
                events_tx,
                storage,
                session_map,
                restore_session_map,
                permission_responders,
            )
            .await;
        }
        "fs/read_text_file" => {
            handle_read_text_file(message, writer_tx, storage, session_map).await;
        }
        "display_image" | "acp-webui/display_image" | "_acp-webui/display_image" => {
            handle_display_image(message, writer_tx, events_tx, storage, session_map).await;
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
                data: None,
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
    restore_session_map: &Arc<RwLock<HashMap<String, String>>>,
    assistant_buffers: &Arc<Mutex<HashMap<String, String>>>,
    assistant_message_ids: &Arc<Mutex<HashMap<String, String>>>,
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
            let blocks = content_blocks_from_content(update.get("content"));
            if !blocks.is_empty() {
                let text = text_fallback_from_blocks(&blocks);
                assistant_buffers
                    .lock()
                    .await
                    .entry(acp_session_id.to_string())
                    .or_default()
                    .push_str(&text);

                if let Some(local_session_id) =
                    session_map.read().await.get(acp_session_id).cloned()
                {
                    persist_live_assistant_chunk(
                        storage,
                        assistant_message_ids,
                        acp_session_id,
                        &local_session_id,
                        &blocks,
                    )
                    .await;
                    if !text.is_empty() {
                        let _ = events_tx.send(RealtimeEvent::TextDelta {
                            session_id: local_session_id,
                            delta: text,
                        });
                    }
                } else if restore_session_map
                    .read()
                    .await
                    .contains_key(acp_session_id)
                {
                    tracing::debug!(acp_session_id, "buffered replayed assistant message chunk");
                } else {
                    tracing::debug!(
                        acp_session_id,
                        "assistant message chunk for unknown ACP session"
                    );
                }
            }
        }
        "user_message_chunk" => {
            if let Some(local_session_id) = restore_session_map
                .read()
                .await
                .get(acp_session_id)
                .cloned()
            {
                let blocks = content_blocks_from_content(update.get("content"));
                if !blocks.is_empty() {
                    let text = text_fallback_from_blocks(&blocks);
                    persist_replayed_message(
                        storage,
                        events_tx,
                        &local_session_id,
                        role::USER,
                        &text,
                        &blocks,
                    )
                    .await;
                } else {
                    tracing::debug!(?update, "replayed user message did not include text");
                }
            } else {
                tracing::debug!(?update, "ignored user message chunk outside restore");
            }
        }
        "tool_call" | "tool_call_update" => {
            let live_session_id = session_map.read().await.get(acp_session_id).cloned();
            let restore_session_id = restore_session_map
                .read()
                .await
                .get(acp_session_id)
                .cloned();
            let Some(local_session_id) = live_session_id.or_else(|| restore_session_id.clone())
            else {
                tracing::debug!(acp_session_id, "tool update for unknown ACP session");
                return;
            };
            flush_assistant_buffer_for_session(
                acp_session_id,
                &local_session_id,
                events_tx,
                storage,
                assistant_buffers,
                assistant_message_ids,
                restore_session_id.is_some(),
                restore_session_id.is_none(),
            )
            .await;
            if restore_session_id.is_some() && tool_call_id(update).is_none() {
                tracing::debug!(
                    ?update,
                    "replayed tool update did not include stable tool call id"
                );
            }
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
            if let Some(artifact_input) = review_artifact_from_update(&local_session_id, update) {
                match storage.upsert_review_artifact(artifact_input).await {
                    Ok(result) => {
                        if result.created {
                            let _ = events_tx.send(RealtimeEvent::ReviewArtifact {
                                artifact: artifact_summary(&result.artifact),
                            });
                        }
                    }
                    Err(error) => {
                        tracing::error!(?error, ?update, "failed to persist review artifact");
                    }
                }
            }
            persist_display_image_from_tool_update(storage, events_tx, &local_session_id, update)
                .await;
            if let Some(text) = text_from_content(update.get("content"))
                .or_else(|| text_from_content(update.get("output")))
            {
                persist_image_artifacts_from_text(
                    storage,
                    events_tx,
                    &local_session_id,
                    tool_call_id(update).as_deref(),
                    &text,
                )
                .await;
            }
        }
        "config_option_update" => {
            let Some(local_session_id) = session_map.read().await.get(acp_session_id).cloned()
            else {
                tracing::debug!(
                    acp_session_id,
                    "config option update for unknown ACP session"
                );
                return;
            };
            let Some(config_options) = parse_config_options(update.get("configOptions")) else {
                tracing::warn!(
                    acp_session_id,
                    "config option update did not include valid configOptions"
                );
                return;
            };
            match storage
                .update_session_config_options(&local_session_id, Some(config_options))
                .await
            {
                Ok(config_state) => {
                    let _ = events_tx.send(RealtimeEvent::SessionConfigUpdated {
                        session_id: local_session_id,
                        config_options: config_state.config_options,
                        current_model: config_state.current_model,
                    });
                }
                Err(error) => {
                    tracing::error!(?error, "failed to persist config option update");
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

async fn persist_replayed_message(
    storage: &Storage,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    local_session_id: &str,
    message_role: &str,
    content: &str,
    content_blocks: &[MessageContentBlock],
) {
    match storage
        .create_message_if_missing_with_content_blocks(
            local_session_id,
            message_role,
            content,
            content_blocks,
            status::IDLE,
        )
        .await
    {
        Ok(Some(message)) => {
            let _ = events_tx.send(RealtimeEvent::TimelineItemUpsert {
                item: TimelineItem::Message {
                    id: message.id.clone(),
                    session_id: message.session_id.clone(),
                    timestamp: message.created_at.clone(),
                    status: message.status.clone(),
                    role: message.role.clone(),
                    content: message.content.clone(),
                    content_blocks: message.content_blocks.clone(),
                },
            });
        }
        Ok(None) => {
            tracing::debug!(
                local_session_id,
                message_role,
                "ignored duplicate replayed message"
            );
        }
        Err(error) => {
            tracing::error!(?error, "failed to persist replayed message");
        }
    }
}

async fn persist_live_assistant_chunk(
    storage: &Storage,
    assistant_message_ids: &Arc<Mutex<HashMap<String, String>>>,
    acp_session_id: &str,
    local_session_id: &str,
    content_blocks: &[MessageContentBlock],
) {
    let content_delta = text_fallback_from_blocks(content_blocks);
    let existing_message_id = assistant_message_ids
        .lock()
        .await
        .get(acp_session_id)
        .cloned();

    if let Some(message_id) = existing_message_id {
        if let Err(error) = storage
            .append_message_content_blocks(
                &message_id,
                &content_delta,
                content_blocks,
                status::RUNNING,
            )
            .await
        {
            tracing::error!(?error, "failed to append assistant message chunk");
        }
        return;
    }

    match storage
        .create_message_with_content_blocks(
            local_session_id,
            role::ASSISTANT,
            &content_delta,
            content_blocks,
            status::RUNNING,
        )
        .await
    {
        Ok(message) => {
            assistant_message_ids
                .lock()
                .await
                .insert(acp_session_id.to_string(), message.id);
        }
        Err(error) => {
            tracing::error!(?error, "failed to persist assistant message chunk");
        }
    }
}

async fn flush_assistant_buffer_for_session(
    acp_session_id: &str,
    local_session_id: &str,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    storage: &Storage,
    assistant_buffers: &Arc<Mutex<HashMap<String, String>>>,
    assistant_message_ids: &Arc<Mutex<HashMap<String, String>>>,
    dedupe: bool,
    emit_assistant_message: bool,
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

    let persisted_message_id = assistant_message_ids.lock().await.remove(acp_session_id);

    let message = if let Some(message_id) = persisted_message_id {
        match storage
            .update_message_status(&message_id, status::IDLE)
            .await
        {
            Ok(message) => Some(message),
            Err(error) => {
                tracing::error!(?error, "failed to finish assistant message segment");
                return;
            }
        }
    } else if dedupe {
        match storage
            .create_message_if_missing(local_session_id, role::ASSISTANT, &content, status::IDLE)
            .await
        {
            Ok(message) => message,
            Err(error) => {
                tracing::error!(?error, "failed to persist replayed assistant message");
                return;
            }
        }
    } else {
        match storage
            .create_message(local_session_id, role::ASSISTANT, &content, status::IDLE)
            .await
        {
            Ok(message) => Some(message),
            Err(error) => {
                tracing::error!(?error, "failed to persist assistant message segment");
                return;
            }
        }
    };

    if let Some(message) = &message {
        let _ = events_tx.send(RealtimeEvent::TimelineItemUpsert {
            item: TimelineItem::Message {
                id: message.id.clone(),
                session_id: message.session_id.clone(),
                timestamp: message.created_at.clone(),
                status: message.status.clone(),
                role: message.role.clone(),
                content: message.content.clone(),
                content_blocks: message.content_blocks.clone(),
            },
        });
    } else {
        tracing::debug!(
            acp_session_id,
            local_session_id,
            "ignored duplicate replayed assistant message"
        );
    }
    if emit_assistant_message {
        let _ = events_tx.send(RealtimeEvent::AssistantMessage {
            session_id: local_session_id.to_string(),
            content,
        });
    }
}

fn review_artifact_from_update(session_id: &str, update: &Value) -> Option<NewReviewArtifact> {
    if !should_persist_review_artifact(update) {
        return None;
    }

    let update_type = update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .unwrap_or("session_update");
    let tool_call_id = tool_call_id(update);
    let title = tool_call_title(update);
    let kind = review_kind_for_update(update);
    let summary = review_summary(update_type, update);

    Some(NewReviewArtifact {
        session_id: session_id.to_string(),
        tool_call_id,
        kind,
        title,
        summary,
        payload: update.clone(),
        source: "acp".to_string(),
    })
}

fn should_persist_review_artifact(update: &Value) -> bool {
    let kind = review_kind_for_update(update);
    if kind == review_artifact_kind::DIFF || kind == review_artifact_kind::MARKDOWN {
        return true;
    }

    has_nonempty_review_content(update.get("content"))
        || has_nonempty_review_content(update.get("output"))
}

fn has_nonempty_review_content(value: Option<&Value>) -> bool {
    text_from_content(value).is_some()
        || value.is_some_and(|candidate| match candidate {
            Value::Null => false,
            Value::String(text) => !text.trim().is_empty(),
            Value::Array(items) => !items.is_empty(),
            Value::Object(fields) => !fields.is_empty(),
            _ => true,
        })
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
    } else if explicit.contains("image") || explicit.contains("display_image") {
        review_artifact_kind::IMAGE.to_string()
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
    let content = text_from_content(update.get("content"))
        .or_else(|| text_from_content(update.get("output")));
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
        preview: review_artifact_preview(&artifact.kind, &artifact.payload),
        source: artifact.source.clone(),
        created_at: artifact.created_at.clone(),
    }
}

fn review_artifact_preview(kind: &str, payload: &Value) -> Option<Value> {
    if kind != review_artifact_kind::IMAGE {
        return None;
    }
    Some(json!({
        "mimeType": payload.get("mimeType").cloned().unwrap_or(Value::Null),
        "data": payload.get("data").cloned().unwrap_or(Value::Null),
        "name": payload.get("name").cloned().unwrap_or(Value::Null),
        "caption": payload.get("caption").cloned().unwrap_or(Value::Null),
        "sourcePath": payload.get("sourcePath").cloned().unwrap_or(Value::Null)
    }))
}

async fn handle_permission_request(
    message: Value,
    writer_tx: &mpsc::Sender<Value>,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    restore_session_map: &Arc<RwLock<HashMap<String, String>>>,
    permission_responders: &Arc<Mutex<HashMap<String, Value>>>,
) {
    let request_id = message.get("id").cloned().unwrap_or(Value::Null);
    let acp_session_id = message["params"]
        .get("sessionId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if restore_session_map
        .read()
        .await
        .contains_key(&acp_session_id)
    {
        tracing::warn!(
            ?message,
            "ignored replayed permission request during session restore"
        );
        send_permission_result(request_id, cancelled_permission_response(), writer_tx).await;
        return;
    }

    let Some(local_session_id) = session_map.read().await.get(&acp_session_id).cloned() else {
        tracing::warn!(?message, "permission request for unknown ACP session");
        send_permission_result(request_id, cancelled_permission_response(), writer_tx).await;
        return;
    };

    let params = &message["params"];
    let tool_call = params.get("toolCall").cloned().unwrap_or(Value::Null);
    let options = params.get("options").cloned().unwrap_or_else(|| json!([]));
    let input = NewPermissionRequest {
        session_id: local_session_id.clone(),
        acp_session_id,
        acp_request_id: request_id.to_string(),
        tool_call_id: tool_call_id(&tool_call),
        title: permission_tool_call_title(&tool_call),
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
                session_id: local_session_id.clone(),
                status: status::WAITING_APPROVAL.to_string(),
            });
            let pending_permissions = storage
                .pending_permissions_for_session(&local_session_id)
                .await
                .unwrap_or_else(|error| {
                    tracing::error!(?error, "failed to load permission queue after request");
                    vec![permission.clone()]
                });
            let pending_approval_count = pending_permissions.len() as i64;
            let _ = events_tx.send(RealtimeEvent::PermissionRequested {
                permission,
                active_permission: pending_permissions.first().cloned(),
                pending_approval_count,
                queued_approval_count: queued_approval_count(pending_approval_count),
            });
        }
        Err(error) => {
            tracing::error!(?error, "failed to persist permission request");
            send_permission_result(request_id, cancelled_permission_response(), writer_tx).await;
        }
    }
}

async fn handle_read_text_file(
    message: Value,
    writer_tx: &mpsc::Sender<Value>,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
) {
    let request_id = message.get("id").cloned().unwrap_or(Value::Null);
    match read_text_file_for_session(&message["params"], storage, session_map).await {
        Ok(content) => {
            send_success_response(request_id, json!({ "content": content }), writer_tx).await;
        }
        Err(error) => {
            send_error_response(request_id, error.code, error.message, writer_tx).await;
        }
    }
}

async fn handle_display_image(
    message: Value,
    writer_tx: &mpsc::Sender<Value>,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
) {
    let request_id = message.get("id").cloned().unwrap_or(Value::Null);
    match display_image_for_session(&message["params"], storage, session_map, "display_image").await
    {
        Ok(artifact) => {
            let summary = artifact_summary(&artifact);
            let _ = events_tx.send(RealtimeEvent::ReviewArtifact {
                artifact: summary.clone(),
            });
            send_success_response(
                request_id,
                json!({
                    "displayed": true,
                    "artifactId": artifact.id,
                    "kind": artifact.kind,
                    "title": artifact.title,
                    "summary": artifact.summary,
                    "source": summary.source
                }),
                writer_tx,
            )
            .await;
        }
        Err(error) => {
            send_error_response(request_id, error.code, error.message, writer_tx).await;
        }
    }
}

async fn persist_display_image_from_tool_update(
    storage: &Storage,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    local_session_id: &str,
    update: &Value,
) {
    if !looks_like_display_image_call(update) {
        return;
    }
    let Some(path) = find_string_field(update, &["path", "imagePath", "file"]) else {
        return;
    };
    match display_image_artifact_for_local_session(
        storage,
        local_session_id,
        tool_call_id(update),
        &path,
        find_string_field(update, &["title", "name"]).as_deref(),
        find_string_field(update, &["caption", "description"]).as_deref(),
        "display_image",
    )
    .await
    {
        Ok(artifact) => {
            let _ = events_tx.send(RealtimeEvent::ReviewArtifact {
                artifact: artifact_summary(&artifact),
            });
        }
        Err(error) => {
            tracing::debug!(?error.message, "ignored invalid display_image tool artifact");
        }
    }
}

pub async fn persist_image_artifacts_from_text(
    storage: &Storage,
    events_tx: &broadcast::Sender<RealtimeEvent>,
    local_session_id: &str,
    tool_call_id: Option<&str>,
    text: &str,
) {
    let mut created = 0usize;
    for path in candidate_image_paths(text) {
        if created >= 3 {
            break;
        }
        match display_image_artifact_for_local_session(
            storage,
            local_session_id,
            tool_call_id.map(ToString::to_string),
            &path,
            None,
            None,
            "path_enrichment",
        )
        .await
        {
            Ok(artifact) => {
                created += 1;
                let _ = events_tx.send(RealtimeEvent::ReviewArtifact {
                    artifact: artifact_summary(&artifact),
                });
            }
            Err(error) => {
                tracing::debug!(?error.message, path, "ignored text image path candidate");
            }
        }
    }
}

async fn display_image_for_session(
    params: &Value,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
    source: &str,
) -> Result<ReviewArtifact, AcpClientRequestError> {
    let acp_session_id = params
        .get("sessionId")
        .and_then(Value::as_str)
        .filter(|session_id| !session_id.trim().is_empty())
        .ok_or_else(|| AcpClientRequestError::invalid_params("sessionId is required"))?;
    let path = params
        .get("path")
        .or_else(|| params.get("imagePath"))
        .or_else(|| params.get("file"))
        .and_then(Value::as_str)
        .filter(|path| !path.trim().is_empty())
        .ok_or_else(|| AcpClientRequestError::invalid_params("path is required"))?;
    let Some(local_session_id) = session_map.read().await.get(acp_session_id).cloned() else {
        return Err(AcpClientRequestError::resource_not_found(
            "ACP session is not registered",
        ));
    };
    display_image_artifact_for_local_session(
        storage,
        &local_session_id,
        params
            .get("toolCallId")
            .or_else(|| params.get("tool_call_id"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        path,
        params.get("title").and_then(Value::as_str),
        params.get("caption").and_then(Value::as_str),
        source,
    )
    .await
}

async fn display_image_artifact_for_local_session(
    storage: &Storage,
    local_session_id: &str,
    tool_call_id: Option<String>,
    path: &str,
    title: Option<&str>,
    caption: Option<&str>,
    source: &str,
) -> Result<ReviewArtifact, AcpClientRequestError> {
    let session = storage
        .get_session(local_session_id)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Session not found"))?;
    let workspace = storage
        .get_workspace(&session.workspace_id)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Workspace not found"))?;
    let snapshot = snapshot_workspace_image(&workspace.path, path).await?;
    let title = title
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&snapshot.name)
        .to_string();
    let caption = caption
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let summary = caption
        .clone()
        .unwrap_or_else(|| format!("Image: {}", snapshot.name));
    let artifact = storage
        .create_review_artifact(NewReviewArtifact {
            session_id: local_session_id.to_string(),
            tool_call_id,
            kind: review_artifact_kind::IMAGE.to_string(),
            title,
            summary,
            payload: json!({
                "type": "image",
                "mimeType": snapshot.mime_type,
                "data": snapshot.data,
                "name": snapshot.name,
                "caption": caption,
                "sourcePath": snapshot.relative_path,
                "sizeBytes": snapshot.size_bytes
            }),
            source: source.to_string(),
        })
        .await
        .map_err(|_| AcpClientRequestError::invalid_params("Failed to persist image evidence"))?;
    Ok(artifact)
}

struct ImageSnapshot {
    mime_type: String,
    data: String,
    name: String,
    relative_path: String,
    size_bytes: u64,
}

async fn snapshot_workspace_image(
    workspace_path: &str,
    requested_path: &str,
) -> Result<ImageSnapshot, AcpClientRequestError> {
    let workspace_root = tokio::fs::canonicalize(workspace_path)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Workspace not found"))?;
    let requested_path = normalize_requested_path(&workspace_root, requested_path);
    let canonical_target = tokio::fs::canonicalize(&requested_path)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Image file not found"))?;

    if !path_is_inside(&canonical_target, &workspace_root) {
        return Err(AcpClientRequestError::resource_not_found(
            "Image file is outside the session workspace",
        ));
    }
    let metadata = tokio::fs::metadata(&canonical_target)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Image file not found"))?;
    if !metadata.is_file() {
        return Err(AcpClientRequestError::invalid_params(
            "Image path must refer to a file",
        ));
    }
    if metadata.len() > MAX_DISPLAY_IMAGE_BYTES {
        return Err(AcpClientRequestError::invalid_params(format!(
            "Image files must be {} MB or smaller",
            MAX_DISPLAY_IMAGE_BYTES / 1024 / 1024
        )));
    }
    let bytes = tokio::fs::read(&canonical_target)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Image file is not readable"))?;
    let Some(mime_type) = image_mime_type(&canonical_target, &bytes) else {
        return Err(AcpClientRequestError::invalid_params(
            "Unsupported image type",
        ));
    };
    if !SUPPORTED_DISPLAY_IMAGE_MIME_TYPES.contains(&mime_type.as_str()) {
        return Err(AcpClientRequestError::invalid_params(
            "Unsupported image type",
        ));
    }
    let name = canonical_target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .to_string();
    let relative_path = canonical_target
        .strip_prefix(&workspace_root)
        .ok()
        .and_then(|path| path.to_str())
        .unwrap_or(&name)
        .replace('\\', "/");

    Ok(ImageSnapshot {
        mime_type,
        data: BASE64_STANDARD.encode(bytes),
        name,
        relative_path,
        size_bytes: metadata.len(),
    })
}

fn image_mime_type(path: &Path, bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png".to_string());
    }
    if bytes.len() >= 3 && bytes[0..3] == [0xff, 0xd8, 0xff] {
        return Some("image/jpeg".to_string());
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif".to_string());
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp".to_string());
    }
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "gif" => Some("image/gif".to_string()),
        "webp" => Some("image/webp".to_string()),
        _ => None,
    }
}

fn looks_like_display_image_call(value: &Value) -> bool {
    let mut text = String::new();
    collect_string_values(value, 0, &mut text);
    let text = text.to_ascii_lowercase();
    text.contains("display_image")
        || text.contains("display image")
        || text.contains("acp-webui/display_image")
}

fn find_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    if !value.is_object() && !value.is_array() {
        return None;
    }
    find_string_field_inner(value, keys, 0)
}

fn find_string_field_inner(value: &Value, keys: &[&str], depth: usize) -> Option<String> {
    if depth > 5 {
        return None;
    }
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(text) = map
                    .get(*key)
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|text| !text.is_empty())
                {
                    return Some(text.to_string());
                }
            }
            for key in [
                "input",
                "params",
                "arguments",
                "toolCall",
                "data",
                "content",
                "output",
            ] {
                if let Some(found) = map
                    .get(key)
                    .and_then(|value| find_string_field_inner(value, keys, depth + 1))
                {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => items
            .iter()
            .find_map(|item| find_string_field_inner(item, keys, depth + 1)),
        _ => None,
    }
}

fn collect_string_values(value: &Value, depth: usize, output: &mut String) {
    if depth > 5 {
        return;
    }
    match value {
        Value::String(text) => {
            output.push(' ');
            output.push_str(text);
        }
        Value::Array(items) => {
            for item in items {
                collect_string_values(item, depth + 1, output);
            }
        }
        Value::Object(map) => {
            for (key, value) in map {
                output.push(' ');
                output.push_str(key);
                collect_string_values(value, depth + 1, output);
            }
        }
        _ => {}
    }
}

fn candidate_image_paths(text: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for raw in text.split_whitespace() {
        let candidate = raw
            .trim_matches(|ch: char| {
                matches!(
                    ch,
                    '`' | '\''
                        | '"'
                        | ','
                        | ';'
                        | ':'
                        | '.'
                        | ')'
                        | '('
                        | '['
                        | ']'
                        | '<'
                        | '>'
                        | '!'
                )
            })
            .trim();
        if candidate.is_empty() || candidate.contains("://") {
            continue;
        }
        let lowercase = candidate.to_ascii_lowercase();
        if [".png", ".jpg", ".jpeg", ".webp", ".gif"]
            .iter()
            .any(|extension| lowercase.ends_with(extension))
            && !paths.iter().any(|path| path == candidate)
        {
            paths.push(candidate.to_string());
        }
    }
    paths
}

struct AcpClientRequestError {
    code: i64,
    message: String,
}

impl AcpClientRequestError {
    fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: -32602,
            message: message.into(),
        }
    }

    fn resource_not_found(message: impl Into<String>) -> Self {
        Self {
            code: -32004,
            message: message.into(),
        }
    }
}

async fn read_text_file_for_session(
    params: &Value,
    storage: &Storage,
    session_map: &Arc<RwLock<HashMap<String, String>>>,
) -> Result<String, AcpClientRequestError> {
    let acp_session_id = params
        .get("sessionId")
        .and_then(Value::as_str)
        .filter(|session_id| !session_id.trim().is_empty())
        .ok_or_else(|| AcpClientRequestError::invalid_params("sessionId is required"))?;
    let requested_path = params
        .get("path")
        .and_then(Value::as_str)
        .filter(|path| !path.trim().is_empty())
        .ok_or_else(|| AcpClientRequestError::invalid_params("path is required"))?;
    let line = optional_u32_param(params, "line")?;
    let limit = optional_u32_param(params, "limit")?;

    let Some(local_session_id) = session_map.read().await.get(acp_session_id).cloned() else {
        return Err(AcpClientRequestError::resource_not_found(
            "ACP session is not registered",
        ));
    };

    let session = storage
        .get_session(&local_session_id)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Session not found"))?;
    let workspace = storage
        .get_workspace(&session.workspace_id)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Workspace not found"))?;
    let workspace_root = tokio::fs::canonicalize(&workspace.path)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("Workspace not found"))?;
    let requested_path = normalize_requested_path(&workspace_root, requested_path);
    let canonical_target = tokio::fs::canonicalize(&requested_path)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("File not found"))?;

    if !path_is_inside(&canonical_target, &workspace_root) {
        return Err(AcpClientRequestError::resource_not_found(
            "File is outside the session workspace",
        ));
    }

    let content = tokio::fs::read_to_string(&canonical_target)
        .await
        .map_err(|_| AcpClientRequestError::resource_not_found("File is not readable text"))?;
    Ok(apply_line_bounds(&content, line, limit))
}

fn normalize_requested_path(workspace_root: &Path, requested_path: &str) -> PathBuf {
    let path = PathBuf::from(requested_path);
    if path.is_absolute() {
        path
    } else {
        workspace_root.join(path)
    }
}

fn path_is_inside(target: &Path, root: &Path) -> bool {
    target == root || target.starts_with(root)
}

fn optional_u32_param(params: &Value, key: &str) -> Result<Option<u32>, AcpClientRequestError> {
    let Some(value) = params.get(key) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    let value = value
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| AcpClientRequestError::invalid_params(format!("{key} must be a uint32")))?;
    Ok(Some(value))
}

fn apply_line_bounds(content: &str, line: Option<u32>, limit: Option<u32>) -> String {
    if line.is_none() && limit.is_none() {
        return content.to_string();
    }

    let start = line.unwrap_or(1).saturating_sub(1) as usize;
    let limit = limit
        .and_then(|limit| usize::try_from(limit).ok())
        .unwrap_or(usize::MAX);

    content
        .split_inclusive('\n')
        .skip(start)
        .take(limit)
        .collect()
}

async fn send_success_response(id: Value, result: Value, writer_tx: &mpsc::Sender<Value>) {
    let response = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    });
    let _ = writer_tx.send(response).await;
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
    match content {
        Value::String(text) => (!text.trim().is_empty()).then(|| text.to_string()),
        Value::Array(parts) => {
            let text = parts
                .iter()
                .filter_map(|part| text_from_content(Some(part)))
                .collect::<Vec<_>>()
                .join("\n");
            (!text.is_empty()).then_some(text)
        }
        Value::Object(map) => {
            if content.get("type").and_then(Value::as_str) == Some("text") {
                return content
                    .get("text")
                    .and_then(Value::as_str)
                    .filter(|text| !text.is_empty())
                    .filter(|text| !text.trim().is_empty())
                    .map(|text| text.to_string());
            }

            for key in ["text", "content", "output", "diff", "markdown"] {
                if let Some(text) = text_from_content(map.get(key)) {
                    return Some(text);
                }
            }
            None
        }
        _ => None,
    }
}

fn content_blocks_from_content(content: Option<&Value>) -> Vec<MessageContentBlock> {
    let Some(content) = content else {
        return Vec::new();
    };
    match content {
        Value::String(text) => {
            if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![MessageContentBlock::text(text.to_string())]
            }
        }
        Value::Array(parts) => parts
            .iter()
            .flat_map(|part| content_blocks_from_content(Some(part)))
            .collect(),
        Value::Object(map) => match map.get("type").and_then(Value::as_str) {
            Some("text") => map
                .get("text")
                .and_then(Value::as_str)
                .filter(|text| !text.trim().is_empty())
                .map(|text| vec![MessageContentBlock::text(text.to_string())])
                .unwrap_or_default(),
            Some("image") => {
                let Some(data) = map.get("data").and_then(Value::as_str) else {
                    return Vec::new();
                };
                let Some(mime_type) = map.get("mimeType").and_then(Value::as_str) else {
                    return Vec::new();
                };
                vec![MessageContentBlock::Image {
                    mime_type: mime_type.to_string(),
                    data: data.to_string(),
                    uri: map
                        .get("uri")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                    name: map
                        .get("name")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                }]
            }
            _ => text_from_content(Some(content))
                .map(MessageContentBlock::text)
                .map(|block| vec![block])
                .unwrap_or_default(),
        },
        _ => Vec::new(),
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

fn acp_content_blocks(blocks: &[MessageContentBlock]) -> Vec<Value> {
    blocks
        .iter()
        .map(|block| match block {
            MessageContentBlock::Text { text } => json!({
                "type": "text",
                "text": text
            }),
            MessageContentBlock::Image {
                mime_type,
                data,
                uri,
                ..
            } => {
                let mut value = json!({
                    "type": "image",
                    "mimeType": mime_type,
                    "data": data
                });
                if let Some(uri) = uri {
                    value["uri"] = Value::String(uri.clone());
                }
                value
            }
        })
        .collect()
}

fn prompt_blocks_with_display_image_guidance(
    blocks: &[MessageContentBlock],
) -> Vec<MessageContentBlock> {
    let mut guided = Vec::with_capacity(blocks.len() + 1);
    guided.push(MessageContentBlock::text(DISPLAY_IMAGE_GUIDANCE));
    guided.extend(blocks.iter().cloned());
    guided
}

fn cancelled_permission_response() -> Value {
    json!({
        "outcome": {
            "outcome": "cancelled"
        }
    })
}

fn queued_approval_count(pending_approval_count: i64) -> i64 {
    pending_approval_count.saturating_sub(1).max(0)
}

fn command_path_for_spawn(command: &str) -> PathBuf {
    #[cfg(windows)]
    {
        resolve_windows_path_command(command).unwrap_or_else(|| PathBuf::from(command))
    }

    #[cfg(not(windows))]
    {
        PathBuf::from(command)
    }
}

#[cfg(windows)]
fn resolve_windows_path_command(command: &str) -> Option<PathBuf> {
    let command_path = Path::new(command);
    if command_path.components().count() > 1 || command_path.extension().is_some() {
        return None;
    }

    let path = std::env::var_os("PATH")?;
    let extensions = windows_executable_extensions();
    for directory in std::env::split_paths(&path) {
        for extension in &extensions {
            let candidate = directory.join(format!("{command}{extension}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }

        let candidate = directory.join(command);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

#[cfg(windows)]
fn windows_executable_extensions() -> Vec<String> {
    std::env::var_os("PATHEXT")
        .map(|value| {
            value
                .to_string_lossy()
                .split(';')
                .map(str::trim)
                .filter(|extension| !extension.is_empty())
                .filter(|extension| !extension.eq_ignore_ascii_case(".ps1"))
                .map(|extension| {
                    if extension.starts_with('.') {
                        extension.to_string()
                    } else {
                        format!(".{extension}")
                    }
                })
                .collect::<Vec<_>>()
        })
        .filter(|extensions| !extensions.is_empty())
        .unwrap_or_else(|| {
            [".COM", ".EXE", ".BAT", ".CMD"]
                .iter()
                .map(|extension| extension.to_string())
                .collect()
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
    tool_call_title_field(tool_call)
        .unwrap_or("Tool call")
        .to_string()
}

fn permission_tool_call_title(tool_call: &Value) -> String {
    tool_call_title_field(tool_call)
        .unwrap_or("Permission requested")
        .to_string()
}

fn tool_call_title_field(tool_call: &Value) -> Option<&str> {
    tool_call
        .get("title")
        .or_else(|| tool_call.get("name"))
        .and_then(Value::as_str)
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
    use std::{
        path::{Path, PathBuf},
        sync::Arc,
        time::Duration,
    };

    use tokio::time::timeout;

    use super::*;

    #[cfg(windows)]
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn generic_tool_call_title_uses_neutral_fallback() {
        assert_eq!(tool_call_title(&json!({})), "Tool call");
        assert_eq!(
            tool_call_from_update(
                "session-1",
                &json!({
                    "sessionUpdate": "tool_call_update",
                    "status": "completed"
                })
            )
            .title,
            "Tool call"
        );
    }

    #[test]
    fn permission_tool_call_title_keeps_permission_fallback() {
        assert_eq!(
            permission_tool_call_title(&json!({})),
            "Permission requested"
        );
        assert_eq!(
            permission_tool_call_title(&json!({ "title": "git status --short" })),
            "git status --short"
        );
    }

    #[test]
    fn json_rpc_error_display_includes_details_data() {
        let error: JsonRpcError = serde_json::from_value(json!({
            "code": -32603,
            "message": "Internal error",
            "data": {"details": "spawn EFTYPE"}
        }))
        .unwrap();

        assert_eq!(
            error.to_string(),
            "JSON-RPC error -32603: Internal error (spawn EFTYPE)"
        );
    }

    fn config_for_fake(script: PathBuf, mode: &str) -> Config {
        Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            work_dir: PathBuf::from("."),
            database_url: "sqlite::memory:".to_string(),
            codex_acp_command: "uv".to_string(),
            codex_acp_args: vec![
                "run".to_string(),
                "--script".to_string(),
                script.to_string_lossy().to_string(),
                mode.to_string(),
            ],
            claude_acp_enabled: false,
            claude_acp_command: "npx".to_string(),
            claude_acp_args: vec![],
            opencode_acp_enabled: false,
            opencode_acp_command: "opencode-acp".to_string(),
            opencode_acp_args: vec![],
            frontend_dist: Some(PathBuf::from("frontend/dist")),
            pairing_token: Some("test-token".to_string()),
            disable_auth: false,
            trusted_clients: vec![],
        }
    }

    fn base_test_config() -> Config {
        Config {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            work_dir: PathBuf::from("."),
            database_url: "sqlite::memory:".to_string(),
            codex_acp_command: "codex-acp".to_string(),
            codex_acp_args: vec![],
            claude_acp_enabled: false,
            claude_acp_command: "npx".to_string(),
            claude_acp_args: vec![],
            opencode_acp_enabled: false,
            opencode_acp_command: "opencode-acp".to_string(),
            opencode_acp_args: vec![],
            frontend_dist: Some(PathBuf::from("frontend/dist")),
            pairing_token: Some("test-token".to_string()),
            disable_auth: false,
            trusted_clients: vec![],
        }
    }

    async fn dispatch_client_request(
        storage: &Storage,
        session_map: Arc<RwLock<HashMap<String, String>>>,
        message: Value,
    ) -> Value {
        let (writer_tx, mut writer_rx) = mpsc::channel(1);
        let (events_tx, _) = broadcast::channel(4);
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<PendingResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let restore_session_map = Arc::new(RwLock::new(HashMap::new()));
        let assistant_buffers = Arc::new(Mutex::new(HashMap::new()));
        let assistant_message_ids = Arc::new(Mutex::new(HashMap::new()));
        let permission_responders = Arc::new(Mutex::new(HashMap::new()));

        handle_incoming_message(
            message,
            &pending,
            &writer_tx,
            &events_tx,
            storage,
            &session_map,
            &restore_session_map,
            &assistant_buffers,
            &assistant_message_ids,
            &permission_responders,
        )
        .await;

        timeout(Duration::from_secs(1), writer_rx.recv())
            .await
            .unwrap()
            .unwrap()
    }

    #[cfg(unix)]
    fn create_file_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_file_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_file(target, link)
    }

    #[cfg(windows)]
    #[test]
    fn windows_spawn_command_prefers_pathext_match_over_extensionless_shim() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("codex-acp"), b"node shim").unwrap();
        std::fs::write(dir.path().join("codex-acp.cmd"), b"@echo off").unwrap();

        let previous_path = std::env::var_os("PATH");
        let previous_pathext = std::env::var_os("PATHEXT");
        std::env::set_var("PATH", dir.path());
        std::env::set_var("PATHEXT", ".exe;.cmd;.ps1");

        let resolved = resolve_windows_path_command("codex-acp").unwrap();

        match previous_path {
            Some(value) => std::env::set_var("PATH", value),
            None => std::env::remove_var("PATH"),
        }
        match previous_pathext {
            Some(value) => std::env::set_var("PATHEXT", value),
            None => std::env::remove_var("PATHEXT"),
        }

        assert_eq!(resolved, dir.path().join("codex-acp.cmd"));
    }

    #[test]
    fn content_text_preserves_boundary_whitespace() {
        assert_eq!(
            text_from_content(Some(&json!({"type": "text", "text": " response"}))),
            Some(" response".to_string())
        );
        assert_eq!(
            text_from_content(Some(&json!({"type": "text", "text": "Loaded "}))),
            Some("Loaded ".to_string())
        );
        assert_eq!(
            text_from_content(Some(&json!({"type": "text", "text": "   "}))),
            None
        );
    }

    #[tokio::test]
    async fn config_option_update_persists_and_broadcasts_model_projection() {
        let storage = test_storage().await;
        let dir = tempfile::tempdir().unwrap();
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let session_map = Arc::new(RwLock::new(HashMap::from([(
            "acp-session".to_string(),
            session.id.clone(),
        )])));
        let restore_session_map = Arc::new(RwLock::new(HashMap::new()));
        let assistant_buffers = Arc::new(Mutex::new(HashMap::new()));
        let assistant_message_ids = Arc::new(Mutex::new(HashMap::new()));
        let (events_tx, mut events_rx) = broadcast::channel(4);

        handle_session_update(
            json!({
                "method": "session/update",
                "params": {
                    "sessionId": "acp-session",
                    "update": {
                        "sessionUpdate": "config_option_update",
                        "configOptions": [
                            {
                                "id": "model",
                                "name": "Model",
                                "category": "model",
                                "type": "select",
                                "currentValue": "pro",
                                "options": [
                                    {"value": "fast", "name": "Fast model"},
                                    {"value": "pro", "name": "Pro model"}
                                ]
                            }
                        ]
                    }
                }
            }),
            &events_tx,
            &storage,
            &session_map,
            &restore_session_map,
            &assistant_buffers,
            &assistant_message_ids,
        )
        .await;

        let detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(detail.current_model.as_ref().unwrap().value, "pro");
        assert_eq!(
            detail.current_model.as_ref().unwrap().name.as_deref(),
            Some("Pro model")
        );

        let event = timeout(Duration::from_secs(1), events_rx.recv())
            .await
            .unwrap()
            .unwrap();
        match event {
            RealtimeEvent::SessionConfigUpdated {
                session_id,
                current_model,
                ..
            } => {
                assert_eq!(session_id, session.id);
                assert_eq!(current_model.unwrap().value, "pro");
            }
            other => panic!("unexpected event: {other:?}"),
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
        if mode == "check-read-capability":
            fs_capabilities = message.get("params", {}).get("clientCapabilities", {}).get("fs", {})
            if fs_capabilities.get("readTextFile") is not True or "writeTextFile" in fs_capabilities:
                send({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32602,
                        "message": "missing readTextFile-only client capability"
                    }
                })
                continue
        send({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "agentInfo": {
                    "name": "fake-codex",
                    "version": "0.0.0"
                },
                "agentCapabilities": {
                    "loadSession": True,
                    "sessionCapabilities": {
                        "list": {},
                        "resume": False
                    }
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
    elif method == "session/load":
        if mode == "load-fail":
            send({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32004, "message": "session not found"}
            })
            continue
        send({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": "fake-session",
                "update": {
                    "sessionUpdate": "user_message_chunk",
                    "content": {"type": "text", "text": "Loaded prompt"}
                }
            }
        })
        if mode == "load-permission":
            send({
                "jsonrpc": "2.0",
                "id": "permission-load",
                "method": "session/request_permission",
                "params": {
                    "sessionId": "fake-session",
                    "toolCall": {
                        "toolCallId": "tool-load-permission",
                        "title": "Old permission",
                        "kind": "execute"
                    },
                    "options": [
                        {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"}
                    ]
                }
            })
            json.loads(sys.stdin.readline())
        for text in ["Loaded", " response"]:
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {"type": "text", "text": text}
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
                    "toolCallId": "tool-load",
                    "title": "Loaded tool",
                    "kind": "execute",
                    "status": "completed",
                    "content": [{"type": "text", "text": "loaded artifact"}]
                }
            }
        })
        send({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"sessionId": "fake-session"}
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
                        {"optionId": "allow-always", "name": "Allow always", "kind": "allow_always"},
                        {"optionId": "reject-always", "name": "Reject always", "kind": "reject_always"}
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
        elif mode == "queued-permission":
            send({
                "jsonrpc": "2.0",
                "id": "permission-1",
                "method": "session/request_permission",
                "params": {
                    "sessionId": "fake-session",
                    "toolCall": {
                        "toolCallId": "tool-1",
                        "title": "Run first fake command",
                        "kind": "execute",
                        "content": [{"type": "text", "text": "echo first"}]
                    },
                    "options": [
                        {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                        {"optionId": "reject-once", "name": "Reject", "kind": "reject_once"}
                    ]
                }
            })
            send({
                "jsonrpc": "2.0",
                "id": "permission-2",
                "method": "session/request_permission",
                "params": {
                    "sessionId": "fake-session",
                    "toolCall": {
                        "toolCallId": "tool-2",
                        "title": "Run second fake command",
                        "kind": "execute",
                        "content": [{"type": "text", "text": "echo second"}]
                    },
                    "options": [
                        {"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                        {"optionId": "reject-once", "name": "Reject", "kind": "reject_once"}
                    ]
                }
            })
            first_response = json.loads(sys.stdin.readline())
            second_response = json.loads(sys.stdin.readline())
            first_option = first_response.get("result", {}).get("outcome", {}).get("optionId", "cancelled")
            second_option = second_response.get("result", {}).get("outcome", {}).get("optionId", "cancelled")
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {
                            "type": "text",
                            "text": "Queued permissions resolved with " + first_option + "," + second_option
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
        elif mode == "artifact":
            send({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "fake-session",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "tool-1",
                        "title": "Captured review artifact",
                        "kind": "execute",
                        "status": "completed",
                        "content": [{"type": "text", "text": "git diff -- README.md"}]
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
                        "status": "completed",
                        "content": [{"type": "text", "text": "tool output"}]
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

    #[tokio::test]
    async fn manager_reports_idle_runtime_until_first_use() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let config = config_for_fake(script, "text");
        let (events_tx, _) = broadcast::channel(16);
        let storage = test_storage().await;

        let manager = AgentRuntimeManager::start(&config, storage, events_tx).await;

        assert_eq!(manager.codex_status().await.state, "idle");
        let statuses = manager.statuses().await;
        assert_eq!(statuses[0].id, CODEX_AGENT_ID);
        assert_eq!(statuses[0].status.state, "idle");

        let runtime = manager.runtime_for_use(CODEX_AGENT_ID).await.unwrap();

        assert_eq!(runtime.status().await.state, "ready");
        assert_eq!(manager.codex_status().await.state, "ready");
    }

    #[tokio::test]
    async fn manager_isolates_codex_runtimes_by_permission_mode() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let config = config_for_fake(script, "text");
        let (events_tx, _) = broadcast::channel(16);
        let storage = test_storage().await;
        let manager = AgentRuntimeManager::start(&config, storage, events_tx).await;

        let manual = manager
            .runtime_for_permission_mode_use(CODEX_AGENT_ID, permission_mode::MANUAL)
            .await
            .unwrap();
        let yolo = manager
            .runtime_for_permission_mode_use(CODEX_AGENT_ID, permission_mode::YOLO)
            .await
            .unwrap();

        assert!(!Arc::ptr_eq(&manual, &yolo));
        assert_eq!(manual.permission_mode(), permission_mode::MANUAL);
        assert_eq!(yolo.permission_mode(), permission_mode::YOLO);
        assert!(!manual
            .agent()
            .args
            .contains(&"sandbox_mode=\"danger-full-access\"".to_string()));
        assert!(yolo
            .agent()
            .args
            .contains(&"approval_policy=\"never\"".to_string()));
        assert!(yolo
            .agent()
            .args
            .contains(&"sandbox_mode=\"danger-full-access\"".to_string()));
    }

    #[tokio::test]
    async fn manager_reports_permission_mode_statuses_independently() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let config = config_for_fake(script, "text");
        let (events_tx, _) = broadcast::channel(16);
        let storage = test_storage().await;
        let manager = AgentRuntimeManager::start(&config, storage, events_tx).await;

        let _ = manager
            .runtime_for_permission_mode_use(CODEX_AGENT_ID, permission_mode::YOLO)
            .await
            .unwrap();

        let statuses = manager.statuses().await;
        let codex = statuses
            .iter()
            .find(|agent| agent.id == CODEX_AGENT_ID)
            .unwrap();
        let manual = codex
            .permission_modes
            .iter()
            .find(|mode| mode.id == permission_mode::MANUAL)
            .unwrap();
        let yolo = codex
            .permission_modes
            .iter()
            .find(|mode| mode.id == permission_mode::YOLO)
            .unwrap();

        assert_eq!(manual.status.state, "idle");
        assert_eq!(yolo.status.state, "ready");
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

    #[test]
    fn initialize_capability_parser_accepts_legacy_and_nested_shapes() {
        let capabilities = session_capabilities_from_initialize(&json!({
            "agentCapabilities": {
                "loadSession": true,
                "sessionCapabilities": {
                    "resume": {},
                    "list": true,
                    "close": false
                }
            }
        }));

        assert!(capabilities.load_session);
        assert!(capabilities.resume_session);
        assert!(capabilities.list_sessions);
        assert!(!capabilities.close_session);
    }

    #[test]
    fn initialize_capability_parser_defaults_to_no_session_continuation() {
        let capabilities = session_capabilities_from_initialize(&json!({
            "agentCapabilities": {
                "sessionCapabilities": {
                    "resume": false
                }
            }
        }));

        assert!(!capabilities.load_session);
        assert!(!capabilities.resume_session);
        assert!(!capabilities.list_sessions);
        assert!(!capabilities.close_session);
    }

    #[test]
    fn prompt_capability_parser_reports_image_support() {
        let capabilities = prompt_capabilities_from_initialize(&json!({
            "agentCapabilities": {
                "promptCapabilities": {
                    "image": true,
                    "audio": false,
                    "embeddedContext": true
                }
            }
        }));

        assert!(capabilities.image);
        assert!(!capabilities.audio);
        assert!(capabilities.embedded_context);
    }

    #[test]
    fn image_content_blocks_round_trip_to_acp_shape() {
        let blocks = vec![
            MessageContentBlock::text("look"),
            MessageContentBlock::Image {
                mime_type: "image/png".to_string(),
                data: "aW1hZ2U=".to_string(),
                uri: Some("upload://image.png".to_string()),
                name: Some("image.png".to_string()),
            },
        ];

        let acp_blocks = acp_content_blocks(&blocks);
        assert_eq!(acp_blocks[0], json!({"type": "text", "text": "look"}));
        assert_eq!(acp_blocks[1]["type"], "image");
        assert_eq!(acp_blocks[1]["mimeType"], "image/png");
        assert_eq!(acp_blocks[1]["data"], "aW1hZ2U=");

        let parsed = content_blocks_from_content(Some(&json!(acp_blocks)));
        assert_eq!(
            parsed,
            vec![
                MessageContentBlock::text("look"),
                MessageContentBlock::Image {
                    mime_type: "image/png".to_string(),
                    data: "aW1hZ2U=".to_string(),
                    uri: Some("upload://image.png".to_string()),
                    name: None,
                },
            ]
        );
    }

    #[tokio::test]
    async fn fake_acp_initialize_advertises_read_text_file_capability() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(16);
        let runtime = CodexRuntime::start(
            config_for_fake(script, "check-read-capability"),
            test_storage().await,
            events_tx,
        )
        .await;

        assert_eq!(runtime.status().await.state, "ready");
    }

    #[tokio::test]
    async fn read_text_file_inside_workspace_does_not_request_permission() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("notes.txt");
        std::fs::write(&file_path, "alpha\nbeta\n").unwrap();
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let session_map = Arc::new(RwLock::new(HashMap::from([(
            "acp-session".to_string(),
            session.id.clone(),
        )])));

        let response = dispatch_client_request(
            &storage,
            session_map,
            json!({
                "jsonrpc": "2.0",
                "id": "read-1",
                "method": "fs/read_text_file",
                "params": {
                    "sessionId": "acp-session",
                    "path": file_path
                }
            }),
        )
        .await;

        assert_eq!(response["result"]["content"], "alpha\nbeta\n");
        assert!(response.get("error").is_none());
        assert!(storage
            .pending_permissions_for_session(&session.id)
            .await
            .unwrap()
            .is_empty());
        assert_eq!(
            storage.get_session(&session.id).await.unwrap().status,
            status::IDLE
        );
    }

    #[tokio::test]
    async fn read_text_file_honors_line_and_limit() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("notes.txt"), "one\ntwo\nthree\nfour\n").unwrap();
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let session_map = Arc::new(RwLock::new(HashMap::from([(
            "acp-session".to_string(),
            session.id,
        )])));

        let response = dispatch_client_request(
            &storage,
            session_map,
            json!({
                "jsonrpc": "2.0",
                "id": "read-1",
                "method": "fs/read_text_file",
                "params": {
                    "sessionId": "acp-session",
                    "path": "notes.txt",
                    "line": 2,
                    "limit": 2
                }
            }),
        )
        .await;

        assert_eq!(response["result"]["content"], "two\nthree\n");
    }

    #[tokio::test]
    async fn read_text_file_rejects_outside_workspace() {
        let workspace_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_file = outside_dir.path().join("secret.txt");
        std::fs::write(&outside_file, "secret\n").unwrap();
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let session_map = Arc::new(RwLock::new(HashMap::from([(
            "acp-session".to_string(),
            session.id.clone(),
        )])));

        let response = dispatch_client_request(
            &storage,
            session_map,
            json!({
                "jsonrpc": "2.0",
                "id": "read-1",
                "method": "fs/read_text_file",
                "params": {
                    "sessionId": "acp-session",
                    "path": outside_file
                }
            }),
        )
        .await;

        assert!(response.get("error").is_some());
        assert!(storage
            .pending_permissions_for_session(&session.id)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn read_text_file_rejects_unknown_session() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("notes.txt");
        std::fs::write(&file_path, "alpha\n").unwrap();
        let storage = test_storage().await;
        let session_map = Arc::new(RwLock::new(HashMap::new()));

        let response = dispatch_client_request(
            &storage,
            session_map,
            json!({
                "jsonrpc": "2.0",
                "id": "read-1",
                "method": "fs/read_text_file",
                "params": {
                    "sessionId": "missing-session",
                    "path": file_path
                }
            }),
        )
        .await;

        assert!(response.get("error").is_some());
    }

    #[tokio::test]
    async fn read_text_file_rejects_symlink_escape() {
        let workspace_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_file = outside_dir.path().join("secret.txt");
        let link_path = workspace_dir.path().join("link.txt");
        std::fs::write(&outside_file, "secret\n").unwrap();
        if let Err(error) = create_file_symlink(&outside_file, &link_path) {
            tracing::warn!(?error, "skipping symlink escape test setup");
            return;
        }
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let session_map = Arc::new(RwLock::new(HashMap::from([(
            "acp-session".to_string(),
            session.id,
        )])));

        let response = dispatch_client_request(
            &storage,
            session_map,
            json!({
                "jsonrpc": "2.0",
                "id": "read-1",
                "method": "fs/read_text_file",
                "params": {
                    "sessionId": "acp-session",
                    "path": link_path
                }
            }),
        )
        .await;

        assert!(response.get("error").is_some());
    }

    #[tokio::test]
    async fn display_image_inside_workspace_creates_image_artifact() {
        let dir = tempfile::tempdir().unwrap();
        let image_path = dir.path().join("preview.png");
        std::fs::write(&image_path, b"\x89PNG\r\n\x1a\n").unwrap();
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let session_map = Arc::new(RwLock::new(HashMap::from([(
            "acp-session".to_string(),
            session.id.clone(),
        )])));

        let response = dispatch_client_request(
            &storage,
            session_map,
            json!({
                "jsonrpc": "2.0",
                "id": "image-1",
                "method": "display_image",
                "params": {
                    "sessionId": "acp-session",
                    "path": "preview.png",
                    "caption": "Generated preview"
                }
            }),
        )
        .await;

        assert_eq!(response["result"]["displayed"], true);
        let artifacts = storage
            .list_review_artifact_summaries(&session.id)
            .await
            .unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].kind, review_artifact_kind::IMAGE);
        assert!(artifacts[0].preview.is_some());
        let artifact = storage
            .get_review_artifact_for_session(&session.id, artifacts[0].id.as_str())
            .await
            .unwrap();
        assert_eq!(artifact.payload["mimeType"], "image/png");
        assert_eq!(artifact.payload["sourcePath"], "preview.png");
    }

    #[tokio::test]
    async fn display_image_rejects_outside_workspace() {
        let workspace_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_file = outside_dir.path().join("secret.png");
        std::fs::write(&outside_file, b"\x89PNG\r\n\x1a\n").unwrap();
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(
                workspace_dir.path().to_string_lossy(),
                Some("Test".to_string()),
            )
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let session_map = Arc::new(RwLock::new(HashMap::from([(
            "acp-session".to_string(),
            session.id.clone(),
        )])));

        let response = dispatch_client_request(
            &storage,
            session_map,
            json!({
                "jsonrpc": "2.0",
                "id": "image-1",
                "method": "display_image",
                "params": {
                    "sessionId": "acp-session",
                    "path": outside_file
                }
            }),
        )
        .await;

        assert!(response.get("error").is_some());
        assert!(storage
            .list_review_artifact_summaries(&session.id)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn text_image_path_enrichment_creates_image_artifact() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("result.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "acp-session".to_string())
            .await
            .unwrap();
        let (events_tx, _) = broadcast::channel(4);

        persist_image_artifacts_from_text(
            &storage,
            &events_tx,
            &session.id,
            None,
            "Open result.png to inspect the image.",
        )
        .await;

        let artifacts = storage
            .list_review_artifact_summaries(&session.id)
            .await
            .unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].kind, review_artifact_kind::IMAGE);
    }

    #[test]
    fn display_image_guidance_is_prepended_as_agent_context() {
        let blocks =
            prompt_blocks_with_display_image_guidance(&[MessageContentBlock::text("Make a chart")]);
        let text = text_fallback_from_blocks(&blocks);

        assert!(text.contains("display_image"));
        assert!(text.contains("Make a chart"));
    }

    #[tokio::test]
    async fn fake_acp_text_prompt_returns_text_and_broadcasts_delta() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(16);
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let runtime = CodexRuntime::start(
            config_for_fake(script, "text"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        assert_eq!(runtime.status().await.state, "ready");

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap()
            .session_id;
        let session = storage
            .create_session(&workspace.id, acp_session_id.clone())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), session.id.clone())
            .await;

        let mut rx = events_tx.subscribe();
        let outcome = runtime
            .prompt(acp_session_id, vec![MessageContentBlock::text("Say hello")])
            .await
            .unwrap();

        assert_eq!(outcome.content, "Hello from fake ACP");
        assert!(outcome.message_id.is_some());
        assert_eq!(
            storage
                .list_messages(&session.id)
                .await
                .unwrap()
                .into_iter()
                .map(|message| (message.role, message.content, message.status))
                .collect::<Vec<_>>(),
            vec![(
                role::ASSISTANT.to_string(),
                "Hello from fake ACP".to_string(),
                status::IDLE.to_string()
            )]
        );

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

        assert_eq!(event.0, session.id);
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
            .unwrap()
            .session_id;
        runtime
            .register_session(acp_session_id.clone(), "local-session".to_string())
            .await;

        let outcome = runtime
            .prompt(
                acp_session_id,
                vec![MessageContentBlock::text("Trigger non-text")],
            )
            .await
            .unwrap();

        assert_eq!(outcome.content, "");
    }

    #[tokio::test]
    async fn fake_acp_load_session_replays_without_duplicate_messages() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(32);
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "fake-session".to_string())
            .await
            .unwrap();
        storage
            .create_message(&session.id, role::USER, "Loaded prompt", status::IDLE)
            .await
            .unwrap();
        storage
            .create_message(
                &session.id,
                role::ASSISTANT,
                "Loaded response",
                status::IDLE,
            )
            .await
            .unwrap();
        let runtime = CodexRuntime::start(
            config_for_fake(script, "load"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        runtime
            .load_session(
                "fake-session".to_string(),
                session.id.clone(),
                dir.path().to_string_lossy().to_string(),
            )
            .await
            .unwrap();

        assert!(runtime.has_registered_session(Some("fake-session")).await);
        assert_eq!(storage.list_messages(&session.id).await.unwrap().len(), 2);
        assert_eq!(storage.list_tool_calls(&session.id).await.unwrap().len(), 1);
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
    async fn fake_acp_load_failure_does_not_register_session() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(16);
        let storage = test_storage().await;
        let runtime = CodexRuntime::start(
            config_for_fake(script, "load-fail"),
            storage,
            events_tx.clone(),
        )
        .await;

        let error = runtime
            .load_session(
                "fake-session".to_string(),
                "local-session".to_string(),
                dir.path().to_string_lossy().to_string(),
            )
            .await
            .unwrap_err()
            .to_string();

        assert!(error.contains("session not found"));
        assert!(!runtime.has_registered_session(Some("fake-session")).await);
    }

    #[tokio::test]
    async fn fake_acp_load_ignores_replayed_permission_requests() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(32);
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let session = storage
            .create_session(&workspace.id, "fake-session".to_string())
            .await
            .unwrap();
        let runtime = CodexRuntime::start(
            config_for_fake(script, "load-permission"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        runtime
            .load_session(
                "fake-session".to_string(),
                session.id.clone(),
                dir.path().to_string_lossy().to_string(),
            )
            .await
            .unwrap();

        assert!(storage
            .pending_permissions_for_session(&session.id)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn fake_acp_status_only_tool_call_update_does_not_create_review_artifact() {
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
            .unwrap()
            .session_id;
        let session = storage
            .create_session(&workspace.id, acp_session_id.clone())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), session.id.clone())
            .await;

        let outcome = runtime
            .prompt(
                acp_session_id,
                vec![MessageContentBlock::text("Trigger non-text")],
            )
            .await
            .unwrap();

        assert_eq!(outcome.content, "");
        assert_eq!(
            storage
                .list_review_artifact_summaries(&session.id)
                .await
                .unwrap()
                .len(),
            0
        );
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
            config_for_fake(script, "artifact"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap()
            .session_id;
        let session = storage
            .create_session(&workspace.id, acp_session_id.clone())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), session.id.clone())
            .await;

        let mut rx = events_tx.subscribe();
        let outcome = runtime
            .prompt(
                acp_session_id,
                vec![MessageContentBlock::text("Trigger non-text")],
            )
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
        assert_eq!(artifact.kind, review_artifact_kind::TERMINAL);
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
            .unwrap()
            .session_id;
        let session = storage
            .create_session(&workspace.id, acp_session_id.clone())
            .await
            .unwrap();
        runtime
            .register_session(acp_session_id.clone(), session.id.clone())
            .await;

        let mut rx = events_tx.subscribe();
        let outcome = runtime
            .prompt(
                acp_session_id,
                vec![MessageContentBlock::text("Interleave")],
            )
            .await
            .unwrap();

        assert_eq!(outcome.content, "Second segment");
        assert!(outcome.message_id.is_some());
        assert_eq!(
            storage
                .list_messages(&session.id)
                .await
                .unwrap()
                .into_iter()
                .map(|message| message.content)
                .collect::<Vec<_>>(),
            vec!["First segment", "Second segment"]
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
            .unwrap()
            .session_id;
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
                .prompt(
                    acp_session_id,
                    vec![MessageContentBlock::text("Needs approval")],
                )
                .await
                .unwrap()
        });

        let permission = timeout(Duration::from_secs(1), async move {
            loop {
                match rx.recv().await.unwrap() {
                    RealtimeEvent::PermissionRequested { permission, .. } => break permission,
                    _ => continue,
                }
            }
        })
        .await
        .unwrap();

        assert_eq!(permission.session_id, session.id);
        assert_eq!(permission.options.len(), 4);
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

    #[tokio::test]
    async fn fake_acp_permission_request_accepts_always_options() {
        for option_id in ["allow-always", "reject-always"] {
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
                .unwrap()
                .session_id;
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
                    .prompt(
                        acp_session_id,
                        vec![MessageContentBlock::text("Needs approval")],
                    )
                    .await
                    .unwrap()
            });

            let permission = timeout(Duration::from_secs(1), async move {
                loop {
                    match rx.recv().await.unwrap() {
                        RealtimeEvent::PermissionRequested { permission, .. } => break permission,
                        _ => continue,
                    }
                }
            })
            .await
            .unwrap();

            runtime
                .resolve_permission(&permission.id, option_id)
                .await
                .unwrap();
            let outcome = timeout(Duration::from_secs(1), prompt_handle)
                .await
                .unwrap()
                .unwrap();

            assert_eq!(
                outcome.content,
                format!("Permission resolved with {option_id}")
            );
        }
    }

    #[tokio::test]
    async fn fake_acp_queues_permission_requests_and_resolves_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let script = write_fake_acp(&dir);
        let (events_tx, _) = broadcast::channel(32);
        let storage = test_storage().await;
        let workspace = storage
            .create_workspace(dir.path().to_string_lossy(), Some("Test".to_string()))
            .await
            .unwrap();
        let runtime = CodexRuntime::start(
            config_for_fake(script, "queued-permission"),
            storage.clone(),
            events_tx.clone(),
        )
        .await;

        let acp_session_id = runtime
            .new_session(dir.path().to_string_lossy().to_string())
            .await
            .unwrap()
            .session_id;
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
                .prompt(
                    acp_session_id,
                    vec![MessageContentBlock::text("Needs queued approval")],
                )
                .await
                .unwrap()
        });

        let events = timeout(Duration::from_secs(1), async move {
            let mut events = Vec::new();
            while events.len() < 2 {
                match rx.recv().await.unwrap() {
                    RealtimeEvent::PermissionRequested {
                        permission,
                        active_permission,
                        pending_approval_count,
                        queued_approval_count,
                    } => events.push((
                        permission,
                        active_permission,
                        pending_approval_count,
                        queued_approval_count,
                    )),
                    _ => continue,
                }
            }
            events
        })
        .await
        .unwrap();

        let first = &events[0].0;
        let second = &events[1].0;
        assert_eq!(first.title, "Run first fake command");
        assert_eq!(second.title, "Run second fake command");
        assert_eq!(events[0].2, 1);
        assert_eq!(events[0].3, 0);
        assert_eq!(events[1].1.as_ref().unwrap().id, first.id);
        assert_eq!(events[1].2, 2);
        assert_eq!(events[1].3, 1);

        let error = runtime
            .resolve_permission(&second.id, "allow-once")
            .await
            .unwrap_err()
            .to_string();
        assert!(error.contains("queued behind another approval"));

        runtime
            .resolve_permission(&first.id, "allow-once")
            .await
            .unwrap();
        let detail = storage.session_detail(&session.id).await.unwrap();
        assert_eq!(detail.session.status, status::WAITING_APPROVAL);
        assert_eq!(detail.pending_permission.as_ref().unwrap().id, second.id);
        assert_eq!(detail.queued_approval_count, 0);

        runtime
            .resolve_permission(&second.id, "allow-once")
            .await
            .unwrap();
        assert_eq!(
            storage.get_session(&session.id).await.unwrap().status,
            status::RUNNING
        );
        assert!(storage
            .pending_permissions_for_session(&session.id)
            .await
            .unwrap()
            .is_empty());

        let outcome = timeout(Duration::from_secs(1), prompt_handle)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            outcome.content,
            "Queued permissions resolved with allow-once,allow-once"
        );
    }

    async fn test_storage() -> Storage {
        let storage = Storage::connect("sqlite::memory:").await.unwrap();
        storage.migrate().await.unwrap();
        storage
    }
}
