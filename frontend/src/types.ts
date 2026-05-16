export type ConnectionStatus = {
  state: "idle" | "starting" | "ready" | "failed" | "disabled" | string;
  message?: string | null;
  agentInfo?: unknown;
  promptCapabilities?: AgentPromptCapabilities;
  sessionCapabilities?: AgentSessionCapabilities;
};

export type AgentRuntimeStatus = {
  id: string;
  providerId?: string;
  title: string;
  enabled: boolean;
  status: ConnectionStatus;
  permissionModes: AgentPermissionModeStatus[];
  launchControls?: AgentControl[];
};

export type PermissionModeId = "manual" | "full_auto" | "yolo" | (string & {});

export type PermissionModeRiskLevel = "low" | "medium" | "high" | (string & {});

export type AgentPermissionModeStatus = {
  id: PermissionModeId;
  label: string;
  description: string;
  riskLevel: PermissionModeRiskLevel;
  status: ConnectionStatus;
};

export type AgentControlValue = {
  value: string;
  label: string;
  description?: string | null;
  riskLevel?: PermissionModeRiskLevel | string | null;
};

export type AgentControl = {
  id: string;
  label: string;
  description?: string | null;
  category: string;
  scope: "launch" | "session" | string;
  type: "select" | string;
  defaultValue: string;
  options: AgentControlValue[];
};

export type AgentControlSelection = {
  id: string;
  label: string;
  value: string;
  valueLabel: string;
  category: string;
  scope: string;
  riskLevel?: PermissionModeRiskLevel | string | null;
};

export type AgentSessionCapabilities = {
  loadSession: boolean;
  resumeSession: boolean;
  listSessions: boolean;
  closeSession: boolean;
};

export type AgentPromptCapabilities = {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
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
  title?: string | null;
  nativeTitle?: string | null;
  nativeUpdatedAt?: string | null;
  importSource?: string | null;
  importedAt?: string | null;
  permissionMode: PermissionModeId;
  launchProfileId?: string;
  launchProfileKey?: string;
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
  contentBlocks?: MessageContentBlock[];
  status: string;
  createdAt: string;
};

export type MessageContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string; uri?: string | null; name?: string | null };

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
  preview?: unknown | null;
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
      contentBlocks?: MessageContentBlock[];
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

export type QueuedPrompt = {
  id: string;
  sessionId: string;
  messageId: string;
  prompt: string;
  contentBlocks?: MessageContentBlock[];
  status: string;
  position: number;
  createdAt: string;
  submittedAt?: string | null;
};

export type PromptTemplate = {
  id: string;
  workspaceId: string;
  agentId: string;
  title: string;
  body: string;
  tags: string[];
  position: number;
  useCount: number;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type ActiveTurn = {
  startedAt: string;
  status: "running" | "stopping" | "stopped" | string;
  stopRequestedAt?: string | null;
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
  launchControlSummary?: AgentControlSelection[];
  messages: ChatMessage[];
  queuedPrompts?: QueuedPrompt[];
  activeTurn?: ActiveTurn | null;
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
  launchControlSummary?: AgentControlSelection[];
  queuedPromptCount?: number;
  activeTurn?: ActiveTurn | null;
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
  transcription: TranscriptionCapability;
};

export type TranscriptionCapability = {
  available: boolean;
  maxAudioBytes: number;
};

export type SkillSummary = {
  name: string;
  description?: string | null;
  sourceCategory?: string;
  enabled?: boolean;
  duplicateIndex?: number | null;
};

export type RealtimeEvent =
  | { type: "connection_status"; status: ConnectionStatus }
  | { type: "agent_connection_status"; agentId: string; permissionMode?: PermissionModeId; status: ConnectionStatus }
  | { type: "session_status"; sessionId: string; status: string }
  | { type: "active_turn_updated"; sessionId: string; status: string; activeTurn?: ActiveTurn | null }
  | { type: "queued_prompts_updated"; sessionId: string; queuedPrompts: QueuedPrompt[] }
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
  | { type: "session_list_changed"; workspaceId: string; agentId: string; count: number }
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
  access: "anonymous" | "paired_session" | "auth_disabled" | string;
  pairingRequired: boolean;
  clientIp?: string | null;
};
