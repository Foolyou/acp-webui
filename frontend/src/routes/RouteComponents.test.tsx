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
  newSessionComposePane: vi.fn(),
  sessionsPane: vi.fn(),
  sessionPane: vi.fn(),
  workspaceList: vi.fn()
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
  SessionsPane: mocks.sessionsPane
}));

vi.mock("../features/sessions/SessionPane", () => ({
  SessionPane: mocks.sessionPane
}));

vi.mock("../features/sessions/NewSessionComposePane", () => ({
  NewSessionComposePane: mocks.newSessionComposePane
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
  WorkspaceList: mocks.workspaceList
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
    transcription: { available: false, maxAudioBytes: 0 },
    access: null,
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
      deleteCurrentSession: vi.fn(),
      deleteWorkspace: vi.fn(),
      loadSession: vi.fn(),
      loadSessionList: vi.fn(),
      openDiffFallback: vi.fn(),
      openReviewArtifact: vi.fn(),
      resolvePermission: vi.fn(),
      restoreSession: vi.fn(),
      sendPrompt: vi.fn(),
      setSessionConfigOption: vi.fn(),
      updateCurrentSessionTitle: vi.fn(),
      updateWorkspace: vi.fn(),
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
    mocks.newSessionComposePane.mockReset();
    mocks.navigate.mockReset();
    mocks.sessionsPane.mockReset();
    mocks.sessionPane.mockReset();
    mocks.workspaceList.mockReset();
    mocks.params.workspaceAgentSessions = { workspaceId: "workspace-route", agentId: "agent-route" };
    mocks.params.workspaceAgentSessionDetail = {
      workspaceId: "workspace-route",
      agentId: "agent-route",
      sessionId: "session-route"
    };
  });

  test("passes workspace management actions to Workspaces route", async () => {
    const context = setContext();
    const { WorkspacesRoute } = await import("./RouteComponents");

    const result = WorkspacesRoute();
    const children = Array.isArray(result.props.children) ? result.props.children : [result.props.children];
    const workspaceList = children.find((child: { type?: unknown }) => child?.type === mocks.workspaceList);

    expect(workspaceList).toMatchObject({
      props: expect.objectContaining({
        onDeleteWorkspace: context.actions.deleteWorkspace,
        onUpdateWorkspace: context.actions.updateWorkspace
      })
    });
  });

  test("loads canonical workspace cockpit without redirecting to remembered agent route", async () => {
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

    expect(context.actions.setCurrentWorkspace).toHaveBeenCalledWith("workspace-route");
    expect(context.actions.setCurrentWorkspaceAgent).not.toHaveBeenCalled();
    expect(context.actions.loadSessionList).toHaveBeenCalledWith("workspace-route");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  test("opens root route at remembered workspace cockpit route", async () => {
    localStorage.setItem(
      "workspaceAgentNavigation",
      JSON.stringify({
        version: 1,
        currentAgentIdByWorkspace: { "workspace-current": "agent-remembered" }
      })
    );
    setContext({
      state: {
        ...baseState(),
        currentWorkspaceId: "workspace-current",
        agents: [agent({ id: "agent-default" }), agent({ id: "agent-remembered" })]
      }
    });
    const { IndexRoute } = await import("./RouteComponents");

    IndexRoute();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/sessions",
      params: { workspaceId: "workspace-current" },
      replace: true
    });
  });

  test("opens root route at default workspace cockpit route", async () => {
    setContext({
      state: {
        ...baseState(),
        currentWorkspaceId: "workspace-current",
        agents: [agent({ id: "agent-default" })]
      }
    });
    const { IndexRoute } = await import("./RouteComponents");

    IndexRoute();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/sessions",
      params: { workspaceId: "workspace-current" },
      replace: true
    });
  });

  test("renders workspace-scoped new session compose without redirecting", async () => {
    const context = setContext({
      state: {
        ...baseState(),
        agents: [agent({ id: "agent-default" }), agent({ id: "agent-disabled", enabled: false })]
      }
    });
    const { NewSessionRoute } = await import("./RouteComponents");

    const result = NewSessionRoute();

    expect(context.actions.setCurrentWorkspace).toHaveBeenCalledWith("workspace-route");
    expect(context.actions.setCurrentWorkspaceAgent).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      type: mocks.newSessionComposePane,
      props: expect.objectContaining({
        workspaceId: "workspace-route"
      })
    });
    expect("scopedAgentId" in result.props).toBe(false);
  });

  test("passes workspace-scoped compose prompt to the create-session action", async () => {
    const context = setContext();
    const { NewSessionRoute } = await import("./RouteComponents");

    const result = NewSessionRoute();

    await result.props.onCreate("agent-selected", "manual", { permission: "manual" }, "start here");

    expect(context.actions.createSession).toHaveBeenCalledWith(
      "workspace-route",
      "agent-selected",
      "manual",
      { permission: "manual" },
      "start here"
    );
  });

  test("renders canonical workspace detail route after loading the session", async () => {
    const context = setContext({
      state: {
        ...baseState(),
        currentSession: detail()
      }
    });
    const { SessionDetailRoute } = await import("./RouteComponents");

    const result = SessionDetailRoute();

    expect(result).toMatchObject({
      type: mocks.sessionPane,
      props: expect.objectContaining({
        currentSession: context.state.currentSession
      })
    });
  });

  test("loads compatibility agent session list as workspace cockpit data", async () => {
    const context = setContext();
    const { WorkspaceAgentSessionsRoute } = await import("./RouteComponents");

    WorkspaceAgentSessionsRoute();

    expect(context.actions.setCurrentWorkspaceAgent).toHaveBeenCalledWith("workspace-route", "agent-route");
    expect(context.actions.loadSessionList).toHaveBeenCalledWith("workspace-route");
  });

  test("passes selected agent filter and navigates when switching agents on compatibility session list", async () => {
    setContext();
    const { WorkspaceAgentSessionsRoute } = await import("./RouteComponents");

    const result = WorkspaceAgentSessionsRoute();

    expect(result).toMatchObject({
      type: mocks.sessionsPane,
      props: {
        selectedAgentId: "agent-route"
      }
    });

    result.props.onSelectAgent("agent-next");

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions",
      params: { workspaceId: "workspace-route", agentId: "agent-next" }
    });
  });

  test("clears compatibility agent filter by returning to cockpit route", async () => {
    setContext();
    const { WorkspaceAgentSessionsRoute } = await import("./RouteComponents");

    const result = WorkspaceAgentSessionsRoute();

    result.props.onSelectAgent(null);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspaces/$workspaceId/sessions",
      params: { workspaceId: "workspace-route" }
    });
  });

  test("scopes compatibility new session compose to the route agent", async () => {
    const context = setContext();
    const { NewWorkspaceAgentSessionRoute } = await import("./RouteComponents");

    const result = NewWorkspaceAgentSessionRoute();

    await result.props.onCreate("agent-other", "full_auto", { permission: "full_auto" }, "start here");

    expect(result).toMatchObject({
      type: mocks.newSessionComposePane,
      props: expect.objectContaining({
        scopedAgentId: "agent-route",
        workspaceId: "workspace-route"
      })
    });
    expect(context.actions.createSession).toHaveBeenCalledWith(
      "workspace-route",
      "agent-route",
      "full_auto",
      { permission: "full_auto" },
      "start here"
    );
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

  test("passes session management actions to Session Detail route", async () => {
    mocks.params.workspaceAgentSessionDetail = {
      workspaceId: "workspace-actual",
      agentId: "agent-actual",
      sessionId: "session-route"
    };
    const context = setContext({
      state: {
        ...baseState(),
        currentSession: detail()
      }
    });
    const { WorkspaceAgentSessionDetailRoute } = await import("./RouteComponents");

    const result = WorkspaceAgentSessionDetailRoute();

    expect(result).toMatchObject({
      type: mocks.sessionPane,
      props: expect.objectContaining({
        onDeleteSession: context.actions.deleteCurrentSession,
        onUpdateSessionTitle: context.actions.updateCurrentSessionTitle
      })
    });
  });
});
