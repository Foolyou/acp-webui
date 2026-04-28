use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;

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
    pub agent_name: String,
    pub acp_session_id: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
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
    pub messages: Vec<Message>,
    pub review_artifacts: Vec<ReviewArtifactSummary>,
    pub timeline: Vec<TimelineItem>,
    pub pending_permission: Option<PermissionRequest>,
    pub pending_permissions: Vec<PermissionRequest>,
    pub pending_approval_count: i64,
    pub queued_approval_count: i64,
    pub failure_message: Option<String>,
    pub continuable: bool,
    pub view_only_reason: Option<String>,
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
    pub pending_permission: Option<SessionListPermission>,
    pub queued_approval_count: i64,
    pub review_artifact_count: i64,
    pub has_review_artifacts: bool,
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
pub struct PromptRequest {
    pub prompt: String,
}

pub mod status {
    pub const IDLE: &str = "idle";
    pub const RUNNING: &str = "running";
    pub const WAITING_APPROVAL: &str = "waiting_approval";
    pub const FAILED: &str = "failed";
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

pub mod permission_option_kind {
    pub const ALLOW_ONCE: &str = "allow_once";
    pub const REJECT_ONCE: &str = "reject_once";
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
