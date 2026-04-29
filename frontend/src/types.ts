export type ConnectionStatus = {
  state: "idle" | "starting" | "ready" | "failed" | "disabled" | string;
  message?: string | null;
  agentInfo?: unknown;
  sessionCapabilities?: AgentSessionCapabilities;
};

export type AgentRuntimeStatus = {
  id: string;
  title: string;
  enabled: boolean;
  status: ConnectionStatus;
};

export type AgentSessionCapabilities = {
  loadSession: boolean;
  resumeSession: boolean;
  listSessions: boolean;
  closeSession: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
};

export type Session = {
  id: string;
  workspaceId: string;
  agentId: string;
  agentName: string;
  acpSessionId?: string | null;
  externalSessionId?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  status: string;
  createdAt: string;
};

export type PermissionOptionKind =
  | "allow_once"
  | "reject_once"
  | "allow_always"
  | "reject_always"
  | (string & {});

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
};

export type PermissionRequest = {
  id: string;
  sessionId: string;
  acpSessionId: string;
  toolCallId?: string | null;
  title: string;
  kind: string;
  status: string;
  selectedOptionId?: string | null;
  toolCall: unknown;
  options: PermissionOption[];
  failureMessage?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
};

export type ReviewArtifactSummary = {
  id: string;
  sessionId: string;
  toolCallId?: string | null;
  kind: string;
  title: string;
  summary: string;
  source: string;
  createdAt: string;
};

export type ReviewArtifact = ReviewArtifactSummary & {
  payload: unknown;
};

export type TimelineItem =
  | {
      kind: "message";
      id: string;
      sessionId: string;
      timestamp: string;
      status: string;
      role: "user" | "assistant" | "system" | string;
      content: string;
    }
  | {
      kind: "tool_call";
      id: string;
      sessionId: string;
      timestamp: string;
      status: string;
      toolCallId?: string | null;
      toolKind: string;
      title: string;
      summary: string;
      input: unknown;
      output?: unknown | null;
      reviewArtifactIds: string[];
    }
  | {
      kind: "permission";
      id: string;
      sessionId: string;
      timestamp: string;
      status: string;
      toolCallId?: string | null;
      title: string;
      permissionKind: string;
    }
  | {
      kind: "review_artifact";
      id: string;
      sessionId: string;
      timestamp: string;
      status: string;
      toolCallId?: string | null;
      artifactKind: string;
      title: string;
      summary: string;
      source: string;
    };

export type SessionContinuity = {
  state: "live" | "loadable" | "resumable" | "restoring" | "restored" | "restore_failed" | "view_only" | string;
  continuable: boolean;
  restorable: boolean;
  restoring: boolean;
  reason?: string | null;
  failureMessage?: string | null;
  restoreStartedAt?: string | null;
  restoreCompletedAt?: string | null;
};

export type SessionConfigSelectValue = {
  value: string;
  name: string;
  description?: string | null;
};

export type SessionConfigSelectGroup = {
  name: string;
  description?: string | null;
  options: SessionConfigSelectValue[];
};

export type SessionConfigSelectOption = SessionConfigSelectValue | SessionConfigSelectGroup;

export type SessionConfigOption = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  type: string;
  currentValue?: string | null;
  options?: SessionConfigSelectOption[] | null;
};

export type SessionCurrentModel = {
  configId: string;
  value: string;
  name?: string | null;
};

export type SessionConfigState = {
  configOptions?: SessionConfigOption[] | null;
  currentModel?: SessionCurrentModel | null;
};

export type SessionDetail = {
  session: Session;
  workspace: Workspace;
  configOptions?: SessionConfigOption[] | null;
  currentModel?: SessionCurrentModel | null;
  messages: ChatMessage[];
  reviewArtifacts: ReviewArtifactSummary[];
  timeline: TimelineItem[];
  pendingPermission?: PermissionRequest | null;
  pendingPermissions?: PermissionRequest[];
  pendingApprovalCount?: number;
  queuedApprovalCount?: number;
  failureMessage?: string | null;
  continuity: SessionContinuity;
  continuable: boolean;
  viewOnlyReason?: string | null;
};

export type InboxItem = {
  session: Session;
  workspace: Workspace;
  permission: PermissionRequest;
  queuedApprovalCount?: number;
};

export type SessionListPermission = {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
};

export type SessionListItem = {
  session: Session;
  workspace: Workspace;
  lastActivityAt: string;
  currentModel?: SessionCurrentModel | null;
  pendingPermission?: SessionListPermission | null;
  queuedApprovalCount?: number;
  reviewArtifactCount: number;
  hasReviewArtifacts: boolean;
  continuity: SessionContinuity;
  continuable: boolean;
  viewOnlyReason?: string | null;
};

export type AppData = {
  codex: ConnectionStatus;
  agents: AgentRuntimeStatus[];
  inbox: InboxItem[];
};

export type RealtimeEvent =
  | { type: "connection_status"; status: ConnectionStatus }
  | { type: "agent_connection_status"; agentId: string; status: ConnectionStatus }
  | { type: "session_status"; sessionId: string; status: string }
  | { type: "text_delta"; sessionId: string; delta: string }
  | { type: "assistant_message"; sessionId: string; content: string }
  | {
      type: "permission_requested";
      permission: PermissionRequest;
      activePermission?: PermissionRequest | null;
      pendingApprovalCount?: number;
      queuedApprovalCount?: number;
    }
  | {
      type: "permission_resolved";
      sessionId: string;
      permissionId: string;
      nextPermission?: PermissionRequest | null;
      pendingApprovalCount?: number;
      queuedApprovalCount?: number;
    }
  | { type: "review_artifact"; artifact: ReviewArtifactSummary }
  | { type: "timeline_item_upsert"; item: TimelineItem }
  | { type: "session_restore_started"; sessionId: string }
  | { type: "session_restore_succeeded"; sessionId: string }
  | { type: "session_restore_failed"; sessionId: string; message: string }
  | {
      type: "session_config_updated";
      sessionId: string;
      configOptions?: SessionConfigOption[] | null;
      currentModel?: SessionCurrentModel | null;
    }
  | { type: "error"; message: string };

export type SocketState = "connecting" | "connected" | "disconnected";
export type View = "inbox" | "sessions" | "session";

export type AuthStatus = {
  access: "anonymous" | "paired_session" | "trusted_ip" | string;
  pairingRequired: boolean;
  clientIp?: string | null;
};
