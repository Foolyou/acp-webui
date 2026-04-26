export type ConnectionStatus = {
  state: "starting" | "ready" | "failed" | string;
  message?: string | null;
  agentInfo?: unknown;
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
  agentName: string;
  acpSessionId?: string | null;
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

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: string;
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

export type SessionDetail = {
  session: Session;
  workspace: Workspace;
  messages: ChatMessage[];
  reviewArtifacts: ReviewArtifactSummary[];
  timeline: TimelineItem[];
  pendingPermission?: PermissionRequest | null;
  failureMessage?: string | null;
  continuable: boolean;
  viewOnlyReason?: string | null;
};

export type InboxItem = {
  session: Session;
  workspace: Workspace;
  permission: PermissionRequest;
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
  pendingPermission?: SessionListPermission | null;
  reviewArtifactCount: number;
  hasReviewArtifacts: boolean;
  continuable: boolean;
  viewOnlyReason?: string | null;
};

export type AppData = {
  codex: ConnectionStatus;
  inbox: InboxItem[];
};

export type RealtimeEvent =
  | { type: "connection_status"; status: ConnectionStatus }
  | { type: "session_status"; sessionId: string; status: string }
  | { type: "text_delta"; sessionId: string; delta: string }
  | { type: "assistant_message"; sessionId: string; content: string }
  | { type: "permission_requested"; permission: PermissionRequest }
  | { type: "permission_resolved"; sessionId: string; permissionId: string }
  | { type: "review_artifact"; artifact: ReviewArtifactSummary }
  | { type: "timeline_item_upsert"; item: TimelineItem }
  | { type: "error"; message: string };

export type SocketState = "connecting" | "connected" | "disconnected";
export type View = "inbox" | "sessions" | "session";
