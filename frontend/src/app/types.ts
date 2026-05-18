import type {
  AgentRuntimeStatus,
  AccessObservability,
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
  TranscriptionCapability,
  Workspace
} from "../types";
import { readWorkspaceAgentNavigation } from "./workspaceAgentNavigation";

export type UiState = {
  codex: ConnectionStatus;
  agents: AgentRuntimeStatus[];
  socketState: SocketState;
  initialized: boolean;
  workspaces: Workspace[];
  inbox: InboxItem[];
  transcription: TranscriptionCapability;
  access: AccessObservability | null;
  sessions: SessionListItem[];
  sessionsLoading: boolean;
  currentWorkspaceId: string | null;
  currentAgentId: string | null;
  currentAgentIdByWorkspace: Record<string, string>;
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
  cancelApproval: (options?: { clearQueuedPrompts?: boolean }) => Promise<void>;
  createSession: (
    workspaceId: string,
    agentId?: string,
    permissionMode?: PermissionModeId,
    launchControlValues?: Record<string, string>
  ) => Promise<void>;
  createWorkspace: (path: string) => Promise<void>;
  updateWorkspace: (workspaceId: string, update: { name?: string; path?: string }) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  loadSessionList: (workspaceId?: string | null, agentId?: string | null) => Promise<void>;
  openDiffFallback: () => Promise<void>;
  openReviewArtifact: (artifactId: string) => Promise<void>;
  resolvePermission: (permission: PermissionRequest, optionId: string) => Promise<void>;
  runQueuedPrompts: () => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  sendPrompt: (prompt: string, contentBlocks?: MessageContentBlock[]) => Promise<void>;
  setSessionConfigOption: (configId: string, value: string) => Promise<void>;
  updateCurrentSessionTitle: (title: string) => Promise<void>;
  deleteCurrentSession: () => Promise<void>;
  setActiveReview: (artifact: ReviewArtifact | null) => void;
  setCurrentWorkspace: (workspaceId: string | null) => void;
  setCurrentWorkspaceAgent: (workspaceId: string, agentId: string | null) => void;
};

export type AppRouterContext = {
  actions: AppActions;
  selectedWorkspace: Workspace | null;
  state: UiState;
};

const initialWorkspaceAgentNavigation = readWorkspaceAgentNavigation();

export const initialState: UiState = {
  codex: { state: "starting", message: "Loading app state" },
  agents: [],
  socketState: "connecting",
  initialized: false,
  workspaces: [],
  inbox: [],
  transcription: { available: false, maxAudioBytes: 0 },
  access: null,
  sessions: [],
  sessionsLoading: false,
  currentWorkspaceId: localStorage.getItem("currentWorkspaceId"),
  currentAgentId: null,
  currentAgentIdByWorkspace: initialWorkspaceAgentNavigation.currentAgentIdByWorkspace,
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
