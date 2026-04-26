import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState
} from "@tanstack/react-router";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { api, errorMessage } from "./api";
import { applyRealtimeEvent } from "./realtime";
import type {
  ChatMessage,
  ConnectionStatus,
  InboxItem,
  PermissionOption,
  PermissionRequest,
  RealtimeEvent,
  ReviewArtifact,
  ReviewArtifactSummary,
  SessionDetail,
  SessionListItem,
  SessionListPermission,
  SocketState,
  TimelineItem,
  Workspace
} from "./types";

type UiState = {
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
};

type AppActions = {
  cancelApproval: () => Promise<void>;
  createSession: (workspaceId: string) => Promise<void>;
  createWorkspace: (path: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  loadSessionList: (workspaceId?: string | null) => Promise<void>;
  openDiffFallback: () => Promise<void>;
  openReviewArtifact: (artifactId: string) => Promise<void>;
  resolvePermission: (permission: PermissionRequest, optionId: string) => Promise<void>;
  sendPrompt: (prompt: string) => Promise<void>;
  setActiveReview: (artifact: ReviewArtifact | null) => void;
  setCurrentWorkspace: (workspaceId: string | null) => void;
};

type AppRouterContext = {
  actions: AppActions;
  selectedWorkspace: Workspace | null;
  state: UiState;
};

const initialState: UiState = {
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
  error: null
};

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: WorkbenchShell
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRoute
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxRoute
});

const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces",
  component: WorkspacesRoute
});

const workspaceSessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces/$workspaceId/sessions",
  component: WorkspaceSessionsRoute
});

const newSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces/$workspaceId/sessions/new",
  component: NewSessionRoute
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces/$workspaceId/sessions/$sessionId",
  component: SessionDetailRoute
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  workspacesRoute,
  workspaceSessionsRoute,
  newSessionRoute,
  sessionDetailRoute
]);

const noopAsync = async () => {};
const placeholderContext: AppRouterContext = {
  actions: {
    cancelApproval: noopAsync,
    createSession: noopAsync,
    createWorkspace: noopAsync,
    loadSession: noopAsync,
    loadSessionList: noopAsync,
    openDiffFallback: noopAsync,
    openReviewArtifact: noopAsync,
    resolvePermission: noopAsync,
    sendPrompt: noopAsync,
    setActiveReview: () => {},
    setCurrentWorkspace: () => {}
  },
  selectedWorkspace: null,
  state: initialState
};

const router = createRouter({ routeTree, context: placeholderContext });
const AppDataContext = createContext<AppRouterContext | null>(null);

function useAppContext() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("Missing AppDataContext provider");
  }
  return context;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  const [state, setState] = useState<UiState>(initialState);
  const reconnectTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      try {
        const [appState, workspaces, sessions] = await Promise.all([api.appState(), api.workspaces(), api.sessions()]);
        if (cancelled) return;

        const storedWorkspaceId = localStorage.getItem("currentWorkspaceId");
        const storedSessionId = localStorage.getItem("currentSessionId");
        let currentSession: SessionDetail | null = null;

        if (storedSessionId) {
          try {
            currentSession = await api.session(storedSessionId);
          } catch {
            localStorage.removeItem("currentSessionId");
          }
        }

        if (cancelled) return;
        setState((current) => ({
          ...current,
          codex: appState.codex,
          inbox: appState.inbox,
          sessions,
          workspaces,
          currentWorkspaceId: currentSession?.workspace.id ?? storedWorkspaceId ?? workspaces[0]?.id ?? null,
          currentSession,
          initialized: true
        }));
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({ ...current, error: errorMessage(error), initialized: true }));
        }
      }
    }

    loadInitialState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let closedByEffect = false;

    function connect() {
      setState((current) => ({ ...current, socketState: "connecting" }));
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${scheme}://${window.location.host}/api/ws`);

      socket.addEventListener("open", () => {
        setState((current) => ({ ...current, socketState: "connected" }));
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as RealtimeEvent;
        if (message.type === "connection_status") {
          setState((current) => ({ ...current, codex: message.status }));
          return;
        }
        setState((current) => ({
          ...current,
          ...applyRealtimeEvent(
            {
              currentSession: current.currentSession,
              inbox: current.inbox,
              liveAssistant: current.liveAssistant,
              error: current.error
            },
            message
          ),
          sessions: applySessionListRealtime(current.sessions, message, current.currentSession)
        }));
      });

      socket.addEventListener("close", () => {
        if (closedByEffect) return;
        setState((current) => ({ ...current, socketState: "disconnected" }));
        reconnectTimer.current = window.setTimeout(connect, 1200);
      });

      socket.addEventListener("error", () => {
        setState((current) => ({ ...current, socketState: "disconnected" }));
      });

      return socket;
    }

    const socket = connect();
    return () => {
      closedByEffect = true;
      window.clearTimeout(reconnectTimer.current);
      socket.close();
    };
  }, []);

  const selectedWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId) ?? null,
    [state.currentWorkspaceId, state.workspaces]
  );

  async function runBusy(action: () => Promise<void>) {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      await action();
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
    } finally {
      setState((current) => ({ ...current, busy: false }));
    }
  }

  async function loadSessionList(workspaceId?: string | null) {
    setState((current) => ({ ...current, sessionsLoading: true, error: null }));
    try {
      const sessions = workspaceId ? await api.workspaceSessions(workspaceId) : await api.sessions();
      setState((current) => ({ ...current, sessions, sessionsLoading: false }));
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error), sessionsLoading: false }));
    }
  }

  async function loadSession(sessionId: string) {
    const detail = await api.session(sessionId);
    localStorage.setItem("currentWorkspaceId", detail.workspace.id);
    localStorage.setItem("currentSessionId", detail.session.id);
    setState((current) => ({
      ...current,
      currentSession: detail,
      currentWorkspaceId: detail.workspace.id,
      liveAssistant: ""
    }));
  }

  async function createWorkspace(path: string) {
    await runBusy(async () => {
      const workspace = await api.createWorkspace(path);
      localStorage.setItem("currentWorkspaceId", workspace.id);
      localStorage.removeItem("currentSessionId");
      setState((current) => ({
        ...current,
        workspaces: [workspace, ...current.workspaces.filter((item) => item.id !== workspace.id)],
        currentWorkspaceId: workspace.id,
        currentSession: null
      }));
      await router.navigate({ to: "/workspaces/$workspaceId/sessions", params: { workspaceId: workspace.id } });
    });
  }

  async function createSession(workspaceId: string) {
    setState((current) => ({ ...current, creatingSessionWorkspaceId: workspaceId, error: null }));
    await router.navigate({ to: "/workspaces/$workspaceId/sessions/new", params: { workspaceId } });
    try {
      const detail = await api.createSession(workspaceId);
      localStorage.setItem("currentWorkspaceId", detail.workspace.id);
      localStorage.setItem("currentSessionId", detail.session.id);
      setState((current) => ({
        ...current,
        currentSession: detail,
        currentWorkspaceId: detail.workspace.id,
        creatingSessionWorkspaceId: null,
        sessions: [sessionDetailToListItem(detail), ...current.sessions.filter((item) => item.session.id !== detail.session.id)],
        liveAssistant: ""
      }));
      await router.navigate({
        to: "/workspaces/$workspaceId/sessions/$sessionId",
        params: { workspaceId: detail.workspace.id, sessionId: detail.session.id },
        replace: true
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        creatingSessionWorkspaceId: null,
        error: errorMessage(error)
      }));
    }
  }

  async function sendPrompt(prompt: string) {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const response = await api.prompt(sessionId, prompt);
      setState((current) =>
        current.currentSession
          ? {
              ...current,
              currentSession: {
                ...current.currentSession,
                messages: [...current.currentSession.messages, response.message],
                timeline: [...current.currentSession.timeline, messageToTimelineItem(response.message)],
                session: { ...current.currentSession.session, status: "running" }
              },
              sessions: updateSessionListStatus(current.sessions, sessionId, "running"),
              liveAssistant: ""
            }
          : current
      );
    });
  }

  async function resolvePermission(permission: PermissionRequest, optionId: string) {
    await runBusy(async () => {
      await api.resolvePermission(permission.id, optionId);
      setState((current) =>
        current.currentSession
          ? {
              ...current,
              currentSession: {
                ...current.currentSession,
                pendingPermission: null,
                session: { ...current.currentSession.session, status: "running" }
              },
              sessions: clearSessionListPermission(updateSessionListStatus(current.sessions, permission.sessionId, "running"), permission.sessionId),
              inbox: current.inbox.filter((item) => item.permission.id !== permission.id)
            }
          : current
      );
    });
  }

  async function cancelApproval() {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const detail = await api.cancelSession(sessionId);
      setState((current) => ({
        ...current,
        currentSession: detail,
        sessions: [
          sessionDetailToListItem(detail),
          ...current.sessions.filter((item) => item.session.id !== detail.session.id)
        ],
        inbox: current.inbox.filter((item) => item.session.id !== sessionId)
      }));
    });
  }

  async function openReviewArtifact(artifactId: string) {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const artifact = await api.reviewArtifact(sessionId, artifactId);
      setState((current) => ({ ...current, activeReview: artifact }));
    });
  }

  async function openDiffFallback() {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const response = await api.reviewDiff(sessionId);
      setState((current) => ({ ...current, activeReview: response.artifact }));
    });
  }

  const context = useMemo<AppRouterContext>(
    () => ({
      actions: {
        cancelApproval,
        createSession,
        createWorkspace,
        loadSession,
        loadSessionList,
        openDiffFallback,
        openReviewArtifact,
        resolvePermission,
        sendPrompt,
        setActiveReview: (artifact) => setState((current) => ({ ...current, activeReview: artifact })),
        setCurrentWorkspace: (workspaceId) => {
          if (workspaceId) localStorage.setItem("currentWorkspaceId", workspaceId);
          setState((current) => ({ ...current, currentWorkspaceId: workspaceId }));
        }
      },
      selectedWorkspace,
      state
    }),
    [selectedWorkspace, state]
  );

  return (
    <AppDataContext.Provider value={context}>
      <RouterProvider context={placeholderContext} router={router} />
    </AppDataContext.Provider>
  );
}

function WorkbenchShell() {
  const { actions, state, selectedWorkspace } = useAppContext();
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const showSessionApproval = /\/sessions\/[^/]+$/.test(pathname);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <BrandBlock />
        <WorkbenchNav onNavigate={() => setMobileNavOpen(false)} />
        <StatusStack codex={state.codex} socketState={state.socketState} />
      </aside>

      <section className="workbench">
        <header className="mobile-topbar">
          <Button className="icon-button" onPress={() => setMobileNavOpen(true)}>
            Menu
          </Button>
          <div>
            <p className="eyebrow">ACP Web UI</p>
            <h1>{selectedWorkspace?.name ?? "Codex Session"}</h1>
          </div>
          <div className="mobile-status">
            <StatusDot stateText={state.codex.state} />
            <span>{state.codex.state}</span>
          </div>
        </header>

        {state.error ? <div className="notice error">{state.error}</div> : null}
        <Outlet />
      </section>

      <ApprovalSheet
        busy={state.busy}
        currentSession={showSessionApproval ? state.currentSession : null}
        onCancel={actions.cancelApproval}
        onResolve={actions.resolvePermission}
      />
      <ReviewOverlay artifact={state.activeReview} onClose={() => actions.setActiveReview(null)} />

      <ModalOverlay
        className="modal-backdrop nav-backdrop"
        isDismissable
        isOpen={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      >
        <Modal className="mobile-nav-modal">
          <Dialog aria-label="Navigation" className="modal-dialog">
            <div className="modal-header">
              <BrandBlock />
              <Button className="secondary small" onPress={() => setMobileNavOpen(false)}>
                Close
              </Button>
            </div>
            <WorkbenchNav onNavigate={() => setMobileNavOpen(false)} />
          </Dialog>
        </Modal>
      </ModalOverlay>
    </main>
  );
}

function IndexRoute() {
  const { state } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.initialized) return;
    const session = state.currentSession;
    if (session) {
      void navigate({
        to: "/workspaces/$workspaceId/sessions/$sessionId",
        params: { workspaceId: session.workspace.id, sessionId: session.session.id },
        replace: true
      });
      return;
    }
    if (state.currentWorkspaceId) {
      void navigate({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: state.currentWorkspaceId },
        replace: true
      });
      return;
    }
    void navigate({ to: "/workspaces", replace: true });
  }, [navigate, state.currentSession, state.currentWorkspaceId, state.initialized]);

  return <LoadingPanel text="Loading workspace" />;
}

function InboxRoute() {
  const { actions, state } = useAppContext();
  return <InboxPane inbox={state.inbox} onOpen={(sessionId) => actions.loadSession(sessionId)} />;
}

function WorkspacesRoute() {
  const { actions, state } = useAppContext();
  return (
    <div className="page-surface">
      <PageHeader eyebrow="Workspaces" title="Local projects" />
      <WorkspaceForm busy={state.busy} onCreateWorkspace={actions.createWorkspace} />
      <WorkspaceList workspaces={state.workspaces} />
    </div>
  );
}

function WorkspaceSessionsRoute() {
  const { workspaceId } = workspaceSessionsRoute.useParams();
  const { actions, state } = useAppContext();
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    actions.setCurrentWorkspace(workspaceId);
    void actions.loadSessionList(workspaceId);
  }, [workspaceId]);

  return (
    <SessionsPane
      loading={state.sessionsLoading}
      onCreate={() => actions.createSession(workspaceId)}
      sessions={state.sessions}
      workspace={workspace}
    />
  );
}

function NewSessionRoute() {
  const { workspaceId } = newSessionRoute.useParams();
  const { actions, state } = useAppContext();
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;
  return (
    <CreatingSessionPane
      creating={state.creatingSessionWorkspaceId === workspaceId}
      onRetry={() => actions.createSession(workspaceId)}
      workspace={workspace}
    />
  );
}

function SessionDetailRoute() {
  const { sessionId, workspaceId } = sessionDetailRoute.useParams();
  const { actions, state } = useAppContext();

  useEffect(() => {
    actions.setCurrentWorkspace(workspaceId);
    if (state.currentSession?.session.id !== sessionId) {
      void actions.loadSession(sessionId);
    }
  }, [sessionId, state.currentSession?.session.id, workspaceId]);

  if (!state.currentSession || state.currentSession.session.id !== sessionId) {
    return <LoadingPanel text="Loading session" />;
  }

  return (
    <SessionPane
      busy={state.busy}
      codex={state.codex}
      currentSession={state.currentSession}
      liveAssistant={state.liveAssistant}
      onOpenDiffFallback={actions.openDiffFallback}
      onOpenReviewArtifact={actions.openReviewArtifact}
      onSendPrompt={actions.sendPrompt}
    />
  );
}

function BrandBlock() {
  return (
    <div className="brand">
      <p className="eyebrow">ACP Web UI</p>
      <h1>Codex Session</h1>
    </div>
  );
}

function WorkbenchNav({ onNavigate }: { onNavigate: () => void }) {
  const { state } = useAppContext();
  const currentWorkspaceId = state.currentWorkspaceId ?? state.workspaces[0]?.id ?? "";
  return (
    <nav className="nav-stack">
      <Link activeProps={{ className: "nav-link active" }} className="nav-link" onClick={onNavigate} to="/inbox">
        Inbox <span>{state.inbox.length}</span>
      </Link>
      <Link activeProps={{ className: "nav-link active" }} className="nav-link" onClick={onNavigate} to="/workspaces">
        Workspaces <span>{state.workspaces.length}</span>
      </Link>
      {currentWorkspaceId ? (
        <Link
          activeProps={{ className: "nav-link active" }}
          className="nav-link"
          onClick={onNavigate}
          params={{ workspaceId: currentWorkspaceId }}
          to="/workspaces/$workspaceId/sessions"
        >
          Sessions <span>{state.sessions.length}</span>
        </Link>
      ) : null}
      <div className="nav-section">
        <span>Projects</span>
        {state.workspaces.slice(0, 6).map((workspace) => (
          <Link
            activeProps={{ className: "workspace-nav active" }}
            className="workspace-nav"
            key={workspace.id}
            onClick={onNavigate}
            params={{ workspaceId: workspace.id }}
            to="/workspaces/$workspaceId/sessions"
          >
            <strong>{workspace.name}</strong>
            <small>{workspace.path}</small>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function StatusStack({ codex, socketState }: { codex: ConnectionStatus; socketState: SocketState }) {
  return (
    <div className="status-stack">
      <StatusPill detail={codex.message ?? "Codex"} stateText={codex.state} />
      <StatusPill detail="Realtime" stateText={socketState} />
    </div>
  );
}

function StatusDot({ stateText }: { stateText: string }) {
  return <span aria-label={stateText} className={`status-dot ${stateText}`} />;
}

function StatusPill({ stateText, detail }: { stateText: string; detail: string }) {
  return (
    <div className={`pill ${stateText}`}>
      <span>{stateText}</span>
      <small>{detail}</small>
    </div>
  );
}

function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="page-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function LoadingPanel({ text }: { text: string }) {
  return (
    <div className="page-surface loading-panel">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <p className="muted">{text}</p>
    </div>
  );
}

function InboxPane({ inbox, onOpen }: { inbox: InboxItem[]; onOpen: (sessionId: string) => void }) {
  const navigate = useNavigate();
  return (
    <section className="page-surface">
      <PageHeader eyebrow="Inbox" title="Needs approval" />
      {inbox.length === 0 ? (
        <p className="empty">No approvals waiting.</p>
      ) : (
        <div className="item-list">
          {inbox.map((item) => (
            <Button
              className="list-item"
              key={item.permission.id}
              onPress={() => {
                void onOpen(item.session.id);
                void navigate({
                  to: "/workspaces/$workspaceId/sessions/$sessionId",
                  params: { workspaceId: item.workspace.id, sessionId: item.session.id }
                });
              }}
            >
              <span className="item-title">{item.permission.title}</span>
              <span>
                {item.workspace.name} · {item.session.agentName} · {item.session.status}
              </span>
              <small>{item.permission.kind}</small>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

function SessionsPane({
  loading,
  onCreate,
  sessions,
  workspace
}: {
  loading: boolean;
  onCreate: () => void;
  sessions: SessionListItem[];
  workspace: Workspace | null;
}) {
  return (
    <section className="page-surface">
      <div className="section-head">
        <PageHeader eyebrow="Sessions" title={workspace?.name ?? "Sessions"} />
        <div className="section-actions">
          <span className="muted">{loading ? "Loading" : sessions.length}</span>
          <Button className="primary small" onPress={onCreate}>
            New Session
          </Button>
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="empty-panel">
          <p className="empty">No sessions yet.</p>
          <Button className="primary" onPress={onCreate}>
            Start Session
          </Button>
        </div>
      ) : (
        <div className="item-list">
          {sessions.map((item) => (
            <SessionListRow item={item} key={item.session.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function SessionListRow({ item }: { item: SessionListItem }) {
  return (
    <Link
      className="list-item session-row"
      params={{ workspaceId: item.workspace.id, sessionId: item.session.id }}
      to="/workspaces/$workspaceId/sessions/$sessionId"
    >
      <span className="item-title">{item.workspace.name}</span>
      <span>
        {item.session.agentName} · {item.session.status} · {formatRelativeTime(item.lastActivityAt)}
      </span>
      <span className="item-path">{item.workspace.path}</span>
      <span className="session-badges">
        {!item.continuable ? <strong>View only</strong> : null}
        {item.pendingPermission ? <strong>Approval: {item.pendingPermission.title}</strong> : null}
        {item.hasReviewArtifacts ? <strong>{item.reviewArtifactCount} review items</strong> : null}
      </span>
    </Link>
  );
}

function CreatingSessionPane({
  creating,
  onRetry,
  workspace
}: {
  creating: boolean;
  onRetry: () => void;
  workspace: Workspace | null;
}) {
  return (
    <section className="session-layout">
      <PageHeader eyebrow="New Session" title={workspace?.name ?? "Starting Codex"} />
      <div className="timeline">
        <div className="message assistant live">
          <div className="message-role">codex</div>
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="message-content">Starting Codex...</div>
        </div>
      </div>
      {!creating ? (
        <div className="composer-status error">
          Session creation did not complete.
          <Button className="secondary small" onPress={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function WorkspaceForm({ busy, onCreateWorkspace }: { busy: boolean; onCreateWorkspace: (path: string) => Promise<void> }) {
  const [path, setPath] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) return;
    await onCreateWorkspace(trimmed);
    setPath("");
  }

  return (
    <form className="inline-form" onSubmit={onSubmit}>
      <input
        autoComplete="off"
        name="path"
        onChange={(event) => setPath(event.target.value)}
        placeholder="/home/user/project"
        value={path}
      />
      <Button className="primary" isDisabled={busy} type="submit">
        Add
      </Button>
    </form>
  );
}

function WorkspaceList({ workspaces }: { workspaces: Workspace[] }) {
  if (workspaces.length === 0) {
    return <p className="empty">No workspaces yet.</p>;
  }

  return (
    <div className="item-list">
      {workspaces.map((workspace) => (
        <Link
          className="list-item"
          key={workspace.id}
          params={{ workspaceId: workspace.id }}
          to="/workspaces/$workspaceId/sessions"
        >
          <span className="item-title">{workspace.name}</span>
          <span className="item-path">{workspace.path}</span>
        </Link>
      ))}
    </div>
  );
}

function SessionPane({
  busy,
  codex,
  currentSession,
  liveAssistant,
  onOpenDiffFallback,
  onOpenReviewArtifact,
  onSendPrompt
}: {
  busy: boolean;
  codex: ConnectionStatus;
  currentSession: SessionDetail;
  liveAssistant: string;
  onOpenDiffFallback: () => void;
  onOpenReviewArtifact: (artifactId: string) => void;
  onSendPrompt: (prompt: string) => Promise<void>;
}) {
  const waitingApproval = currentSession.session.status === "waiting_approval";
  const running = currentSession.session.status === "running" || waitingApproval;
  const canSend = currentSession.continuable && !running;

  return (
    <section className="session-layout">
      <div className="session-toolbar">
        <PageHeader eyebrow={currentSession.workspace.name} title="Session" />
        <div className="section-actions">
          <Button className="secondary small" isDisabled={busy} onPress={onOpenDiffFallback}>
            Diff
          </Button>
          <span className={`badge ${currentSession.session.status}`}>{currentSession.session.status}</span>
        </div>
      </div>
      <div className="timeline" id="timeline">
        {currentSession.failureMessage ? <div className="notice error">{currentSession.failureMessage}</div> : null}
        {!currentSession.continuable ? <div className="notice warning">{currentSession.viewOnlyReason}</div> : null}
        {waitingApproval ? (
          <div className="notice approval">
            Waiting for approval: {currentSession.pendingPermission?.title ?? "Permission requested"}
          </div>
        ) : null}
        {currentSession.timeline.map((item) => (
          <TimelineRow item={item} key={`${item.kind}-${item.id}`} onOpenReviewArtifact={onOpenReviewArtifact} />
        ))}
        {running && !liveAssistant ? <RunningSkeleton waitingApproval={waitingApproval} /> : null}
        {liveAssistant ? <MessageBubble live message={liveMessage(currentSession.session.id, liveAssistant)} /> : null}
      </div>
      <PromptComposer
        busy={busy}
        codex={codex}
        disabled={!canSend}
        running={running}
        viewOnlyReason={currentSession.viewOnlyReason}
        waitingApproval={waitingApproval}
        onSendPrompt={onSendPrompt}
      />
    </section>
  );
}

function TimelineRow({
  item,
  onOpenReviewArtifact
}: {
  item: TimelineItem;
  onOpenReviewArtifact: (artifactId: string) => void;
}) {
  switch (item.kind) {
    case "message":
      return <MessageBubble message={timelineMessage(item)} />;
    case "tool_call":
      return <ToolCallRow item={item} onOpenReviewArtifact={onOpenReviewArtifact} />;
    case "review_artifact":
      return (
        <ReviewArtifactCard
          artifact={{
            id: item.id,
            sessionId: item.sessionId,
            toolCallId: item.toolCallId,
            kind: item.artifactKind,
            title: item.title,
            summary: item.summary,
            source: item.source,
            createdAt: item.timestamp
          }}
          onOpen={onOpenReviewArtifact}
        />
      );
    case "permission":
      return (
        <div className="timeline-event">
          <span>{item.status}</span>
          <strong>{item.title}</strong>
        </div>
      );
  }
}

function ToolCallRow({
  item,
  onOpenReviewArtifact
}: {
  item: Extract<TimelineItem, { kind: "tool_call" }>;
  onOpenReviewArtifact: (artifactId: string) => void;
}) {
  return (
    <details className={`tool-row ${item.status}`}>
      <summary>
        <span className="tool-kind">{item.toolKind}</span>
        <strong>{item.title}</strong>
        <span>{item.status}</span>
      </summary>
      <p>{item.summary}</p>
      {item.reviewArtifactIds.length ? (
        <div className="tool-links">
          {item.reviewArtifactIds.map((artifactId) => (
            <Button className="secondary small" key={artifactId} onPress={() => onOpenReviewArtifact(artifactId)}>
              Open artifact
            </Button>
          ))}
        </div>
      ) : null}
      <details className="raw-details">
        <summary>Raw</summary>
        <pre className="review-pre">{JSON.stringify({ input: item.input, output: item.output }, null, 2)}</pre>
      </details>
    </details>
  );
}

function RunningSkeleton({ waitingApproval }: { waitingApproval: boolean }) {
  return (
    <div className="message assistant live">
      <div className="message-role">{waitingApproval ? "approval" : "codex"}</div>
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
    </div>
  );
}

function PromptComposer({
  busy,
  codex,
  disabled,
  onSendPrompt,
  running,
  viewOnlyReason,
  waitingApproval
}: {
  busy: boolean;
  codex: ConnectionStatus;
  disabled: boolean;
  onSendPrompt: (prompt: string) => Promise<void>;
  running: boolean;
  viewOnlyReason?: string | null;
  waitingApproval: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [composing, setComposing] = useState(false);

  async function submitPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed || disabled || busy) return;
    await onSendPrompt(trimmed);
    setPrompt("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submitPrompt();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (composing) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submitPrompt();
    }
  }

  const status = viewOnlyReason
    ? viewOnlyReason
    : waitingApproval
      ? "Waiting for approval"
      : running
        ? "Codex is working..."
        : codex.state !== "ready"
          ? codex.message ?? "Codex is not ready"
          : null;

  return (
    <div className="composer-wrap">
      {status ? <div className={`composer-status ${viewOnlyReason ? "warning" : ""}`}>{status}</div> : null}
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          disabled={disabled}
          onChange={(event) => setPrompt(event.target.value)}
          onCompositionEnd={() => setComposing(false)}
          onCompositionStart={() => setComposing(true)}
          onKeyDown={onKeyDown}
          placeholder={
            viewOnlyReason
              ? "Start a new session to continue"
              : waitingApproval
                ? "Resolve approval before sending another prompt"
                : "Ask Codex..."
          }
          rows={3}
          value={prompt}
        />
        <div className="composer-actions">
          <span className="shortcut-hint">Ctrl Enter</span>
          <Button className="primary" isDisabled={disabled || busy} type="submit">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ live = false, message }: { live?: boolean; message: ChatMessage }) {
  return (
    <article className={`message ${message.role} ${live ? "live" : ""}`}>
      <div className="message-role">{message.role}</div>
      <div className="message-content">{message.content}</div>
    </article>
  );
}

function ReviewArtifactCard({
  artifact,
  onOpen
}: {
  artifact: ReviewArtifactSummary;
  onOpen: (artifactId: string) => void;
}) {
  return (
    <Button className="review-card" onPress={() => onOpen(artifact.id)}>
      <span className="message-role">{artifact.kind}</span>
      <strong>{artifact.title}</strong>
      <span>{artifact.summary}</span>
      <small>
        {artifact.source}
        {artifact.toolCallId ? ` · ${artifact.toolCallId}` : ""}
      </small>
    </Button>
  );
}

function ApprovalSheet({
  busy,
  currentSession,
  onCancel,
  onResolve
}: {
  busy: boolean;
  currentSession: SessionDetail | null;
  onCancel: () => void;
  onResolve: (permission: PermissionRequest, optionId: string) => void;
}) {
  const permission = currentSession?.pendingPermission;
  const open = Boolean(permission && currentSession?.session.status === "waiting_approval");
  return (
    <ModalOverlay className="modal-backdrop" isDismissable={false} isOpen={open}>
      <Modal className="sheet-modal">
        <Dialog aria-label="Approval request" className="modal-dialog">
          {permission && currentSession ? (
            <>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">{permission.kind}</p>
                  <Heading slot="title">{permission.title}</Heading>
                </div>
                <Button className="secondary small" isDisabled={busy} onPress={onCancel}>
                  Cancel
                </Button>
              </div>
              <div className="modal-body">
                <div className="approval-context">
                  <span>{currentSession.workspace.name}</span>
                  <span>{currentSession.session.agentName}</span>
                </div>
                <pre className="tool-summary">{toolSummary(permission.toolCall)}</pre>
              </div>
              <div className="modal-footer approval-actions">
                {permission.options.map((option) => (
                  <PermissionOptionButton
                    busy={busy}
                    key={option.optionId}
                    onResolve={() => onResolve(permission, option.optionId)}
                    option={option}
                  />
                ))}
              </div>
            </>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function PermissionOptionButton({
  busy,
  onResolve,
  option
}: {
  busy: boolean;
  onResolve: () => void;
  option: PermissionOption;
}) {
  const isAlways = option.kind === "allow_always" || option.kind === "reject_always";
  return (
    <Button className={`approval-option ${option.kind}`} isDisabled={busy || isAlways} onPress={onResolve}>
      <span>{option.name}</span>
      {isAlways ? <small>Not available yet</small> : null}
    </Button>
  );
}

function ReviewOverlay({ artifact, onClose }: { artifact: ReviewArtifact | null; onClose: () => void }) {
  return (
    <ModalOverlay className="modal-backdrop" isDismissable isOpen={Boolean(artifact)} onOpenChange={(open) => !open && onClose()}>
      <Modal className="review-modal">
        <Dialog aria-label="Review artifact" className="modal-dialog">
          {artifact ? (
            <>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">{artifact.kind}</p>
                  <Heading slot="title">{artifact.title}</Heading>
                </div>
                <Button className="secondary small" onPress={onClose}>
                  Close
                </Button>
              </div>
              <div className="modal-body">
                <p className="muted">{artifact.summary}</p>
                <ReviewPayload artifact={artifact} />
              </div>
            </>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function ReviewPayload({ artifact }: { artifact: ReviewArtifact }) {
  if (artifact.kind === "diff") {
    return <DiffPayload payload={artifact.payload} />;
  }
  if (artifact.kind === "markdown") {
    return <MarkdownPayload payload={artifact.payload} />;
  }
  if (artifact.kind === "terminal") {
    return <pre className="review-pre">{payloadText(artifact.payload)}</pre>;
  }
  return <pre className="review-pre">{JSON.stringify(artifact.payload, null, 2)}</pre>;
}

function DiffPayload({ payload }: { payload: unknown }) {
  const diff = payloadText(payload);
  const files = diff
    .split("\n")
    .filter((line) => line.startsWith("diff --git "))
    .map((line) => line.split(" b/")[1] ?? line);
  const hunks = diff.split("\n").filter((line) => line.startsWith("@@"));

  return (
    <>
      {files.length ? (
        <div className="review-nav">
          {files.map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
      ) : null}
      {hunks.length ? (
        <div className="review-nav hunks">
          {hunks.map((hunk) => (
            <span key={hunk}>{hunk}</span>
          ))}
        </div>
      ) : null}
      <pre className="review-pre diff">{diff || "No diff content."}</pre>
    </>
  );
}

function MarkdownPayload({ payload }: { payload: unknown }) {
  const text = payloadText(payload);
  return (
    <>
      <div className="markdown-preview">
        {text.split("\n").map((line, index) => {
          const key = `${index}-${line}`;
          if (line.startsWith("### ")) return <h3 key={key}>{line.slice(4)}</h3>;
          if (line.startsWith("## ")) return <h2 key={key}>{line.slice(3)}</h2>;
          if (line.startsWith("# ")) return <h2 key={key}>{line.slice(2)}</h2>;
          if (line.startsWith("- ")) return <li key={key}>{line.slice(2)}</li>;
          if (!line.trim()) return null;
          return <p key={key}>{line}</p>;
        })}
      </div>
      <details className="raw-details">
        <summary>Raw</summary>
        <pre className="review-pre">{text}</pre>
      </details>
    </>
  );
}

function payloadText(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;
    for (const key of ["diff", "markdown", "content", "text", "output"]) {
      if (typeof value[key] === "string") {
        return value[key];
      }
    }
  }
  return JSON.stringify(payload, null, 2);
}

function toolSummary(toolCall: unknown) {
  if (!toolCall || typeof toolCall !== "object") {
    return "No additional details.";
  }
  const value = toolCall as Record<string, unknown>;
  const content = value.content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const partValue = part as Record<string, unknown>;
        return typeof partValue.text === "string" ? partValue.text : "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  return JSON.stringify(toolCall, null, 2);
}

function liveMessage(sessionId: string, content: string): ChatMessage {
  return {
    id: "live-assistant",
    sessionId,
    role: "assistant",
    content,
    status: "running",
    createdAt: new Date().toISOString()
  };
}

function timelineMessage(item: Extract<TimelineItem, { kind: "message" }>): ChatMessage {
  return {
    id: item.id,
    sessionId: item.sessionId,
    role: item.role,
    content: item.content,
    status: item.status,
    createdAt: item.timestamp
  };
}

function messageToTimelineItem(message: ChatMessage): TimelineItem {
  return {
    kind: "message",
    id: message.id,
    sessionId: message.sessionId,
    timestamp: message.createdAt,
    status: message.status,
    role: message.role,
    content: message.content
  };
}

function sessionDetailToListItem(detail: SessionDetail): SessionListItem {
  return {
    session: detail.session,
    workspace: detail.workspace,
    lastActivityAt: detail.session.updatedAt,
    pendingPermission: detail.pendingPermission
      ? {
          id: detail.pendingPermission.id,
          title: detail.pendingPermission.title,
          kind: detail.pendingPermission.kind,
          createdAt: detail.pendingPermission.createdAt
        }
      : null,
    reviewArtifactCount: detail.reviewArtifacts.length,
    hasReviewArtifacts: detail.reviewArtifacts.length > 0,
    continuable: detail.continuable,
    viewOnlyReason: detail.viewOnlyReason ?? null
  };
}

function applySessionListRealtime(
  sessions: SessionListItem[],
  event: RealtimeEvent,
  currentSession: SessionDetail | null
): SessionListItem[] {
  switch (event.type) {
    case "session_status":
      return updateSessionListStatus(sessions, event.sessionId, event.status);
    case "permission_requested":
      return updateSessionListPermission(
        sessions,
        event.permission.sessionId,
        {
          id: event.permission.id,
          title: event.permission.title,
          kind: event.permission.kind,
          createdAt: event.permission.createdAt
        },
        currentSession
      );
    case "permission_resolved":
      return clearSessionListPermission(sessions, event.sessionId);
    case "review_artifact":
      return updateSessionListReviewAvailability(sessions, event.artifact.sessionId);
    default:
      return sessions;
  }
}

function updateSessionListStatus(sessions: SessionListItem[], sessionId: string, status: string) {
  const now = new Date().toISOString();
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          lastActivityAt: now,
          session: { ...item.session, status, updatedAt: now }
        }
      : item
  );
}

function updateSessionListPermission(
  sessions: SessionListItem[],
  sessionId: string,
  pendingPermission: SessionListPermission,
  currentSession: SessionDetail | null
) {
  const existing = sessions.some((item) => item.session.id === sessionId);
  const updated = sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          pendingPermission,
          session: { ...item.session, status: "waiting_approval" }
        }
      : item
  );

  if (existing || currentSession?.session.id !== sessionId) {
    return updated;
  }

  return [
    {
      ...sessionDetailToListItem(currentSession),
      pendingPermission,
      session: { ...currentSession.session, status: "waiting_approval" }
    },
    ...updated
  ];
}

function clearSessionListPermission(sessions: SessionListItem[], sessionId: string) {
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          pendingPermission: null
        }
      : item
  );
}

function updateSessionListReviewAvailability(sessions: SessionListItem[], sessionId: string) {
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          reviewArtifactCount: item.reviewArtifactCount + 1,
          hasReviewArtifacts: true
        }
      : item
  );
}

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
