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

export type SessionDetail = {
  session: Session;
  workspace: Workspace;
  messages: ChatMessage[];
  reviewArtifacts: ReviewArtifactSummary[];
  pendingPermission?: PermissionRequest | null;
  failureMessage?: string | null;
};

export type InboxItem = {
  session: Session;
  workspace: Workspace;
  permission: PermissionRequest;
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
  | { type: "error"; message: string };

export type SocketState = "connecting" | "connected" | "disconnected";
export type View = "inbox" | "session";
