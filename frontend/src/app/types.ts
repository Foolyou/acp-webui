import type {
  AgentRuntimeStatus,
  ConnectionStatus,
  AuthStatus,
  InboxItem,
  MessageContentBlock,
  PermissionRequest,
  PermissionModeId,
  ReviewArtifact,
  SessionDetail,
  SessionListItem,
  SocketState,
  Workspace
} from "../types";

export type UiState = {
  codex: ConnectionStatus;
  agents: AgentRuntimeStatus[];
  socketState: SocketState;
  initialized: boolean;
  workspaces: Workspace[];
  inbox: InboxItem[];
  sessions: SessionListItem[];
  sessionsLoading: boolean;
  currentWorkspaceId: string | null;
  currentSession: SessionDetail | null;
  activeReview: ReviewArtifact | null;
  liveAssistant: string;
  busy: boolean;
  creatingSessionWorkspaceId: string | null;
  creatingSessionAgentId: string | null;
  creatingSessionPermissionMode: PermissionModeId | null;
  error: string | null;
  auth: AuthStatus | null;
};

export type AppActions = {
  cancelApproval: () => Promise<void>;
  createSession: (
    workspaceId: string,
    agentId?: string,
    permissionMode?: PermissionModeId,
    launchControlValues?: Record<string, string>
  ) => Promise<void>;
  createWorkspace: (path: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  loadSessionList: (workspaceId?: string | null) => Promise<void>;
  openDiffFallback: () => Promise<void>;
  openReviewArtifact: (artifactId: string) => Promise<void>;
  resolvePermission: (permission: PermissionRequest, optionId: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  sendPrompt: (prompt: string, contentBlocks?: MessageContentBlock[]) => Promise<void>;
  setSessionConfigOption: (configId: string, value: string) => Promise<void>;
  setActiveReview: (artifact: ReviewArtifact | null) => void;
  setCurrentWorkspace: (workspaceId: string | null) => void;
};

export type AppRouterContext = {
  actions: AppActions;
  selectedWorkspace: Workspace | null;
  state: UiState;
};

export const initialState: UiState = {
  codex: { state: "starting", message: "Loading app state" },
  agents: [],
  socketState: "connecting",
  initialized: false,
  workspaces: [],
  inbox: [],
  sessions: [],
  sessionsLoading: false,
  currentWorkspaceId: localStorage.getItem("currentWorkspaceId"),
  currentSession: null,
  activeReview: null,
  liveAssistant: "",
  busy: false,
  creatingSessionWorkspaceId: null,
  creatingSessionAgentId: null,
  creatingSessionPermissionMode: null,
  error: null,
  auth: null
};
