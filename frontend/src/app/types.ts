import type {
  ConnectionStatus,
  AuthStatus,
  InboxItem,
  PermissionRequest,
  ReviewArtifact,
  SessionDetail,
  SessionListItem,
  SocketState,
  Workspace
} from "../types";

export type UiState = {
  codex: ConnectionStatus;
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
  error: string | null;
  auth: AuthStatus | null;
};

export type AppActions = {
  cancelApproval: () => Promise<void>;
  createSession: (workspaceId: string) => Promise<void>;
  createWorkspace: (path: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  loadSessionList: (workspaceId?: string | null) => Promise<void>;
  openDiffFallback: () => Promise<void>;
  openReviewArtifact: (artifactId: string) => Promise<void>;
  resolvePermission: (permission: PermissionRequest, optionId: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  sendPrompt: (prompt: string) => Promise<void>;
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
  error: null,
  auth: null
};
