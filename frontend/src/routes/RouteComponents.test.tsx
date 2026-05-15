import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AppRouterContext, UiState } from "../app/types";
import type { AgentRuntimeStatus } from "../types";
import type { SessionDetail } from "../types";

const mocks = vi.hoisted(() => ({
  appContext: null as AppRouterContext | null,
  loadingPanel: vi.fn(),
  navigate: vi.fn(),
  params: {
    workspaceAgentSessions: { workspaceId: "workspace-route", agentId: "agent-route" },
    workspaceAgentSessionDetail: {
      workspaceId: "workspace-route",
      agentId: "agent-route",
      sessionId: "session-route"
    }
  },
  sessionPane: vi.fn()
}));

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => effect()
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}));

vi.mock("../app/context", () => ({
  useAppContext: () => {
    if (!mocks.appContext) {
      throw new Error("Missing app context");
    }
    return mocks.appContext;
  }
}));

vi.mock("../features/sessions/SessionsPane", () => ({
  SessionsPane: () => null
}));

vi.mock("../features/sessions/SessionPane", () => ({
  SessionPane: mocks.sessionPane
}));

vi.mock("../features/sessions/CreatingSessionPane", () => ({
  CreatingSessionPane: () => null
}));

vi.mock("../features/sessions/InboxPane", () => ({
  InboxPane: () => null
}));

vi.mock("../features/agents/AgentsStatusPane", () => ({
  AgentsStatusPane: () => null
}));

vi.mock("../features/workspaces/WorkspaceForm", () => ({
  WorkspaceForm: () => null
}));

vi.mock("../features/workspaces/WorkspaceList", () => ({
  WorkspaceList: () => null
}));

vi.mock("../components/common", () => ({
  LoadingPanel: mocks.loadingPanel,
  PageHeader: () => null
}));

vi.mock("./router", () => ({
  newSessionRoute: { useParams: () => ({ workspaceId: "workspace-route" }) },
  sessionDetailRoute: {
    useParams: () => ({ workspaceId: "workspace-route", sessionId: "session-route" })
  },
  workspaceAgentNewSessionRoute: {
    useParams: () => ({ workspaceId: "workspace-route", agentId: "agent-route" })
  },
  workspaceAgentSessionDetailRoute: {
    useParams: () => mocks.params.workspaceAgentSessionDetail
  },
  workspaceAgentSessionsRoute: {
    useParams: () => mocks.params.workspaceAgentSessions
  },
  workspaceSessionsRoute: { useParams: () => ({ workspaceId: "workspace-route" }) }
}));

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: "session-route",
      workspaceId: "workspace-actual",
      agentId: "agent-actual",
      agentName: "Agent",
      permissionMode: "manual",
      status: "idle",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z"
    },
    workspace: {
      id: "workspace-actual",
      name: "Workspace",
      path: "workspace",
      createdAt: "2026-04-30T00:00:00Z"
    },
    messages: [],
    queuedPrompts: [],
    activeTurn: null,
    reviewArtifacts: [],
    timeline: [],
    continuity: {
      state: "view_only",
      continuable: false,
      restorable: false,
      restoring: false
    },
    continuable: false,
    ...overrides
  };
}

function agent(overrides: Partial<AgentRuntimeStatus> = {}): AgentRuntimeStatus {
  return {
    id: "agent-route",
    title: "Agent",
    enabled: true,
    status: { state: "idle" },
    permissionModes: [],
    ...overrides
  };
}

function baseState(): UiState {
  return {
    codex: { state: "starting", message: "Loading app state" },
    agents: [],
    socketState: "connecting",
    initialized: true,
    workspaces: [],
    inbox: [],
    sessions: [],
    sessionsLoading: false,
    currentWorkspaceId: null,
    currentAgentId: null,
    currentAgentIdByWorkspace: {},
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
}

function setContext(context: Partial<AppRouterContext> = {}) {
  mocks.appContext = {
    actions: {
      cancelApproval: vi.fn(),
      createSession: vi.fn(),
      createWorkspace: vi.fn(),
      loadSession: vi.fn(),
      loadSessionList: vi.fn(),
      openDiffFallback: vi.fn(),
      openReviewArtifact: vi.fn(),
      resolvePermission: vi.fn(),
      restoreSession: vi.fn(),
      sendPrompt: vi.fn(),
      setSessionConfigOption: vi.fn(),
      setActiveReview: vi.fn(),
      setCurrentWorkspace: vi.fn(),
      setCurrentWorkspaceAgent: vi.fn()
    },
    selectedWorkspace: null,
    state: baseState(),
    ...context
  };
  return mocks.appContext;
}

describe("workspace-agent route components", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    mocks.loadingPanel.mockReset();
    mocks.navigate.mockReset();
    mocks.sessionPane.mockReset();
    mocks.params.workspaceAgentSessions = { workspaceId: "workspace-route", agentId: "agent-route" };
    mocks.params.workspaceAgentSessionDetail = {
      workspaceId: "workspace-route",
      agentId: "agent-route",
      sessionId: "session-route"
    };
  });

  test("replaces legacy workspace session list with remembered agent route", async () => {
    localStorage.setItem(
      "workspaceAgentNavigation",
      JSON.stringify({
        version: 1,
        currentAgentIdByWorkspace: { "workspace-route": "agent-remembered" }
      })
    );
    const context = setContext({
      state: {
        ...baseState(),
        agents: [agent({ id: "agent-default" }), agent({ id: "agent-remembered" })]
      }
    });
    const { WorkspaceSessionsRoute } = await import("./RouteComponents");

    WorkspaceSessionsRoute();

    expect(context.actions.setCurrentWorkspaceAgent).toHaveBeenCalledWith("workspace-route", "agent-remembered");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions",
      params: { workspaceId: "workspace-route", agentId: "agent-remembered" },
      replace: true
    });
    expect(context.actions.loadSessionList).not.toHaveBeenCalled();
  });

  test("replaces legacy new session route with default agent route", async () => {
    const context = setContext({
      state: {
        ...baseState(),
        agents: [agent({ id: "agent-default" }), agent({ id: "agent-disabled", enabled: false })]
      }
    });
    const { NewSessionRoute } = await import("./RouteComponents");

    NewSessionRoute();

    expect(context.actions.setCurrentWorkspaceAgent).toHaveBeenCalledWith("workspace-route", "agent-default");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/new",
      params: { workspaceId: "workspace-route", agentId: "agent-default" },
      replace: true
    });
  });

  test("replaces legacy detail route with the loaded session scope", async () => {
    const context = setContext({
      state: {
        ...baseState(),
        currentSession: detail()
      }
    });
    const { SessionDetailRoute } = await import("./RouteComponents");

    const result = SessionDetailRoute();

    expect(context.actions.setCurrentWorkspaceAgent).toHaveBeenCalledWith("workspace-actual", "agent-actual");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId",
      params: {
        workspaceId: "workspace-actual",
        agentId: "agent-actual",
        sessionId: "session-route"
      },
      replace: true
    });
    expect(result).toMatchObject({
      type: mocks.loadingPanel,
      props: { text: "Loading session" }
    });
    expect(mocks.sessionPane).not.toHaveBeenCalled();
  });

  test("loads canonical session list with workspace and agent route params", async () => {
    const context = setContext();
    const { WorkspaceAgentSessionsRoute } = await import("./RouteComponents");

    WorkspaceAgentSessionsRoute();

    expect(context.actions.setCurrentWorkspaceAgent).toHaveBeenCalledWith("workspace-route", "agent-route");
    expect(context.actions.loadSessionList).toHaveBeenCalledWith("workspace-route", "agent-route");
  });

  test("replaces mismatched canonical detail route with the loaded session scope", async () => {
    const context = setContext({
      state: {
        ...baseState(),
        currentSession: detail()
      }
    });
    const { WorkspaceAgentSessionDetailRoute } = await import("./RouteComponents");

    WorkspaceAgentSessionDetailRoute();

    expect(context.actions.setCurrentWorkspaceAgent).toHaveBeenCalledWith("workspace-actual", "agent-actual");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId",
      params: {
        workspaceId: "workspace-actual",
        agentId: "agent-actual",
        sessionId: "session-route"
      },
      replace: true
    });
  });
});
