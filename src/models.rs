use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentControlValue {
    pub value: String,
    pub label: String,
    pub description: Option<String>,
    pub risk_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentControl {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub category: String,
    pub scope: String,
    #[serde(rename = "type")]
    pub control_type: String,
    pub default_value: String,
    pub options: Vec<AgentControlValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentControlSelection {
    pub id: String,
    pub label: String,
    pub value: String,
    pub value_label: String,
    pub category: String,
    pub scope: String,
    pub risk_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub workspace_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub permission_mode: String,
    pub launch_profile_id: String,
    pub launch_profile_key: String,
    pub acp_session_id: Option<String>,
    pub external_session_id: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPermissionMode {
    pub id: String,
    pub label: String,
    pub description: String,
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCapabilities {
    pub load_session: bool,
    pub resume_session: bool,
    pub list_sessions: bool,
    pub close_session: bool,
}

impl AgentSessionCapabilities {
    pub fn none() -> Self {
        Self {
            load_session: false,
            resume_session: false,
            list_sessions: false,
            close_session: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContinuity {
    pub state: String,
    pub continuable: bool,
    pub restorable: bool,
    pub restoring: bool,
    pub reason: Option<String>,
    pub failure_message: Option<String>,
    pub restore_started_at: Option<String>,
    pub restore_completed_at: Option<String>,
}

impl SessionContinuity {
    pub fn live() -> Self {
        Self {
            state: continuity_state::LIVE.to_string(),
            continuable: true,
            restorable: false,
            restoring: false,
            reason: None,
            failure_message: None,
            restore_started_at: None,
            restore_completed_at: None,
        }
    }

    pub fn loadable(reason: impl Into<String>) -> Self {
        Self {
            state: continuity_state::LOADABLE.to_string(),
            continuable: false,
            restorable: true,
            restoring: false,
            reason: Some(reason.into()),
            failure_message: None,
            restore_started_at: None,
            restore_completed_at: None,
        }
    }

    pub fn resumable(reason: impl Into<String>) -> Self {
        Self {
            state: continuity_state::RESUMABLE.to_string(),
            continuable: false,
            restorable: false,
            restoring: false,
            reason: Some(reason.into()),
            failure_message: None,
            restore_started_at: None,
            restore_completed_at: None,
        }
    }

    pub fn restoring(started_at: Option<String>) -> Self {
        Self {
            state: continuity_state::RESTORING.to_string(),
            continuable: false,
            restorable: false,
            restoring: true,
            reason: Some("Restoring this agent session...".to_string()),
            failure_message: None,
            restore_started_at: started_at,
            restore_completed_at: None,
        }
    }

    pub fn restored(completed_at: Option<String>) -> Self {
        Self {
            state: continuity_state::RESTORED.to_string(),
            continuable: true,
            restorable: false,
            restoring: false,
            reason: None,
            failure_message: None,
            restore_started_at: None,
            restore_completed_at: completed_at,
        }
    }

    pub fn restore_failed(
        message: impl Into<String>,
        started_at: Option<String>,
        restorable: bool,
    ) -> Self {
        let message = message.into();
        Self {
            state: continuity_state::RESTORE_FAILED.to_string(),
            continuable: false,
            restorable,
            restoring: false,
            reason: Some(message.clone()),
            failure_message: Some(message),
            restore_started_at: started_at,
            restore_completed_at: None,
        }
    }

    pub fn view_only(reason: impl Into<String>) -> Self {
        Self {
            state: continuity_state::VIEW_ONLY.to_string(),
            continuable: false,
            restorable: false,
            restoring: false,
            reason: Some(reason.into()),
            failure_message: None,
            restore_started_at: None,
            restore_completed_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub session: Session,
    pub workspace: Workspace,
    pub config_options: Option<Vec<SessionConfigOption>>,
    pub current_model: Option<SessionCurrentModel>,
    pub launch_control_summary: Vec<AgentControlSelection>,
    pub messages: Vec<Message>,
    pub review_artifacts: Vec<ReviewArtifactSummary>,
    pub timeline: Vec<TimelineItem>,
    pub pending_permission: Option<PermissionRequest>,
    pub pending_permissions: Vec<PermissionRequest>,
    pub pending_approval_count: i64,
    pub queued_approval_count: i64,
    pub failure_message: Option<String>,
    pub continuity: SessionContinuity,
    pub continuable: bool,
    pub view_only_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    #[serde(rename = "type")]
    pub option_type: String,
    pub current_value: Option<String>,
    pub options: Option<Vec<SessionConfigSelectOption>>,
    #[serde(rename = "_meta")]
    pub meta: Option<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum SessionConfigSelectOption {
    Group(SessionConfigSelectGroup),
    Value(SessionConfigSelectValue),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigSelectGroup {
    pub name: String,
    pub description: Option<String>,
    pub options: Vec<SessionConfigSelectValue>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigSelectValue {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionCurrentModel {
    pub config_id: String,
    pub value: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigState {
    pub config_options: Option<Vec<SessionConfigOption>>,
    pub current_model: Option<SessionCurrentModel>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum TimelineItem {
    Message {
        id: String,
        session_id: String,
        timestamp: String,
        status: String,
        role: String,
        content: String,
    },
    ToolCall {
        id: String,
        session_id: String,
        timestamp: String,
        status: String,
        tool_call_id: Option<String>,
        tool_kind: String,
        title: String,
        summary: String,
        input: Value,
        output: Option<Value>,
        review_artifact_ids: Vec<String>,
    },
    Permission {
        id: String,
        session_id: String,
        timestamp: String,
        status: String,
        tool_call_id: Option<String>,
        title: String,
        permission_kind: String,
    },
    ReviewArtifact {
        id: String,
        session_id: String,
        timestamp: String,
        status: String,
        tool_call_id: Option<String>,
        artifact_kind: String,
        title: String,
        summary: String,
        source: String,
    },
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReviewArtifactRow {
    pub id: String,
    pub session_id: String,
    pub tool_call_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub payload_json: String,
    pub source: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewArtifactSummary {
    pub id: String,
    pub session_id: String,
    pub tool_call_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub source: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewArtifact {
    pub id: String,
    pub session_id: String,
    pub tool_call_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub payload: Value,
    pub source: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct NewReviewArtifact {
    pub session_id: String,
    pub tool_call_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub payload: Value,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRow {
    pub id: String,
    pub session_id: String,
    pub acp_tool_call_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub input_json: String,
    pub output_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpsertToolCall {
    pub session_id: String,
    pub acp_tool_call_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub input: Value,
    pub output: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFallbackResponse {
    pub artifact: ReviewArtifact,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequestRow {
    pub id: String,
    pub session_id: String,
    pub acp_session_id: String,
    pub acp_request_id: String,
    pub tool_call_id: Option<String>,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub selected_option_id: Option<String>,
    pub tool_call_json: String,
    pub options_json: String,
    pub failure_message: Option<String>,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    pub id: String,
    pub session_id: String,
    pub acp_session_id: String,
    pub tool_call_id: Option<String>,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub selected_option_id: Option<String>,
    pub tool_call: Value,
    pub options: Vec<PermissionOption>,
    pub failure_message: Option<String>,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvePermissionRequest {
    pub option_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub session: Session,
    pub workspace: Workspace,
    pub permission: PermissionRequest,
    pub queued_approval_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListItem {
    pub session: Session,
    pub workspace: Workspace,
    pub last_activity_at: String,
    pub current_model: Option<SessionCurrentModel>,
    pub launch_control_summary: Vec<AgentControlSelection>,
    pub pending_permission: Option<SessionListPermission>,
    pub queued_approval_count: i64,
    pub review_artifact_count: i64,
    pub has_review_artifacts: bool,
    pub continuity: SessionContinuity,
    pub continuable: bool,
    pub view_only_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListPermission {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub path: String,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub agent_id: Option<String>,
    pub permission_mode: Option<String>,
    pub launch_control_values: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub name: String,
    pub description: Option<String>,
    pub source_category: String,
    pub enabled: bool,
    pub duplicate_index: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptRequest {
    pub prompt: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSessionConfigOptionRequest {
    pub value: String,
}

pub mod status {
    pub const IDLE: &str = "idle";
    pub const RUNNING: &str = "running";
    pub const WAITING_APPROVAL: &str = "waiting_approval";
    pub const FAILED: &str = "failed";
}

pub mod permission_mode {
    pub const MANUAL: &str = "manual";
    pub const FULL_AUTO: &str = "full_auto";
    pub const YOLO: &str = "yolo";

    pub fn is_known(value: &str) -> bool {
        matches!(value, MANUAL | FULL_AUTO | YOLO)
    }
}

pub mod continuity_state {
    pub const LIVE: &str = "live";
    pub const LOADABLE: &str = "loadable";
    pub const RESUMABLE: &str = "resumable";
    pub const RESTORING: &str = "restoring";
    pub const RESTORED: &str = "restored";
    pub const RESTORE_FAILED: &str = "restore_failed";
    pub const VIEW_ONLY: &str = "view_only";
}

pub mod role {
    pub const USER: &str = "user";
    pub const ASSISTANT: &str = "assistant";
    pub const SYSTEM: &str = "system";
}

pub mod permission_status {
    pub const PENDING: &str = "pending";
    pub const SELECTED: &str = "selected";
    pub const CANCELLED: &str = "cancelled";
    pub const EXPIRED: &str = "expired";
}

pub mod review_artifact_kind {
    pub const DIFF: &str = "diff";
    pub const MARKDOWN: &str = "markdown";
    pub const TERMINAL: &str = "terminal";
    pub const TOOL_CALL: &str = "tool_call";
    pub const GENERIC: &str = "generic";
}

pub mod tool_call_status {
    pub const RUNNING: &str = "running";
    pub const COMPLETED: &str = "completed";
    pub const FAILED: &str = "failed";
}
