import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
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
  View,
  Workspace
} from "./types";

type UiState = {
  codex: ConnectionStatus;
  socketState: SocketState;
  view: View;
  workspaces: Workspace[];
  inbox: InboxItem[];
  sessions: SessionListItem[];
  sessionsLoading: boolean;
  currentWorkspaceId: string | null;
  currentSession: SessionDetail | null;
  activeReview: ReviewArtifact | null;
  liveAssistant: string;
  busy: boolean;
  error: string | null;
};

const initialState: UiState = {
  codex: { state: "starting", message: "Loading app state" },
  socketState: "connecting",
  view: "inbox",
  workspaces: [],
  inbox: [],
  sessions: [],
  sessionsLoading: false,
  currentWorkspaceId: localStorage.getItem("currentWorkspaceId"),
  currentSession: null,
  activeReview: null,
  liveAssistant: "",
  busy: false,
  error: null
};

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
        const workspaceId = storedWorkspaceId ?? workspaces[0]?.id ?? null;
        const storedSessionId = localStorage.getItem("currentSessionId");
        let currentSession: SessionDetail | null = null;
        let view: View = "sessions";

        if (storedSessionId) {
          try {
            currentSession = await api.session(storedSessionId);
            view = "session";
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
          currentWorkspaceId: currentSession?.workspace.id ?? workspaceId,
          currentSession,
          view
        }));
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({ ...current, error: errorMessage(error) }));
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

  async function loadSessionList() {
    setState((current) => ({ ...current, sessionsLoading: true, error: null }));
    try {
      const sessions = await api.sessions();
      setState((current) => ({ ...current, sessions, sessionsLoading: false }));
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error), sessionsLoading: false }));
    }
  }

  function showSessions() {
    setState((current) => ({ ...current, view: "sessions" }));
    void loadSessionList();
  }

  async function loadSession(sessionId: string) {
    const detail = await api.session(sessionId);
    localStorage.setItem("currentWorkspaceId", detail.workspace.id);
    localStorage.setItem("currentSessionId", detail.session.id);
    setState((current) => ({
      ...current,
      currentSession: detail,
      currentWorkspaceId: detail.workspace.id,
      liveAssistant: "",
      view: "session"
    }));
  }

  function selectWorkspace(workspaceId: string) {
    localStorage.setItem("currentWorkspaceId", workspaceId);
    localStorage.removeItem("currentSessionId");
    setState((current) => ({
      ...current,
      currentWorkspaceId: workspaceId,
      currentSession: null,
      liveAssistant: "",
      view: "session"
    }));
  }

  async function createWorkspace(path: string) {
    await runBusy(async () => {
      const workspace = await api.createWorkspace(path);
      localStorage.setItem("currentWorkspaceId", workspace.id);
      localStorage.removeItem("currentSessionId");
      setState((current) => ({
        ...current,
        workspaces: [workspace, ...current.workspaces],
        currentWorkspaceId: workspace.id,
        currentSession: null,
        view: "session"
      }));
    });
  }

  async function createSession() {
    if (!selectedWorkspace) return;
    await runBusy(async () => {
      const detail = await api.createSession(selectedWorkspace.id);
      localStorage.setItem("currentSessionId", detail.session.id);
      setState((current) => ({
        ...current,
        currentSession: detail,
        currentWorkspaceId: detail.workspace.id,
        sessions: [sessionDetailToListItem(detail), ...current.sessions.filter((item) => item.session.id !== detail.session.id)],
        liveAssistant: "",
        view: "session"
      }));
    });
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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ACP Web UI</p>
          <h1>Codex Session</h1>
        </div>
        <div className="status-stack">
          <StatusPill stateText={state.codex.state} detail={state.codex.message ?? "Codex"} />
          <StatusPill stateText={state.socketState} detail="Realtime" />
        </div>
      </header>

      {state.error ? <div className="notice error">{state.error}</div> : null}

      <nav className="bottom-nav" aria-label="Primary">
        <button className={state.view === "inbox" ? "active" : ""} onClick={() => setState((current) => ({ ...current, view: "inbox" }))}>
          Inbox
        </button>
        <button className={state.view !== "inbox" ? "active" : ""} onClick={showSessions}>
          Sessions
        </button>
      </nav>

      {state.view === "inbox" ? (
        <InboxPane inbox={state.inbox} onOpen={(sessionId) => runBusy(() => loadSession(sessionId))} />
      ) : state.view === "sessions" ? (
        <SessionsPane
          loading={state.sessionsLoading}
          onCreate={() => setState((current) => ({ ...current, view: "session" }))}
          onOpen={(sessionId) => runBusy(() => loadSession(sessionId))}
          sessions={state.sessions}
        />
      ) : (
        <SessionWorkspacePane
          busy={state.busy}
          codex={state.codex}
          currentSession={state.currentSession}
          liveAssistant={state.liveAssistant}
          selectedWorkspace={selectedWorkspace}
          workspaces={state.workspaces}
          onCreateSession={createSession}
          onCreateWorkspace={createWorkspace}
          onOpenDiffFallback={openDiffFallback}
          onOpenReviewArtifact={openReviewArtifact}
          onSelectWorkspace={selectWorkspace}
          onSendPrompt={sendPrompt}
        />
      )}

      <ApprovalSheet
        busy={state.busy}
        currentSession={state.currentSession}
        onCancel={cancelApproval}
        onResolve={resolvePermission}
      />

      <ReviewOverlay artifact={state.activeReview} onClose={() => setState((current) => ({ ...current, activeReview: null }))} />
    </main>
  );
}

function StatusPill({ stateText, detail }: { stateText: string; detail: string }) {
  return (
    <div className={`pill ${stateText}`}>
      <span>{stateText}</span>
      <small>{detail}</small>
    </div>
  );
}

function InboxPane({ inbox, onOpen }: { inbox: InboxItem[]; onOpen: (sessionId: string) => void }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>Needs Approval</h2>
        <span className="muted">{inbox.length}</span>
      </div>
      {inbox.length === 0 ? (
        <p className="empty">No approvals waiting.</p>
      ) : (
        <div className="inbox-list">
          {inbox.map((item) => (
            <button className="inbox-item" key={item.permission.id} onClick={() => onOpen(item.session.id)}>
              <span className="inbox-title">{item.permission.title}</span>
              <span>
                {item.workspace.name} · {item.session.agentName} · {item.session.status}
              </span>
              <small>{item.permission.kind}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SessionsPane({
  loading,
  onCreate,
  onOpen,
  sessions
}: {
  loading: boolean;
  onCreate: () => void;
  onOpen: (sessionId: string) => void;
  sessions: SessionListItem[];
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>Sessions</h2>
        <div className="section-actions">
          <span className="muted">{loading ? "Loading" : sessions.length}</span>
          <button className="secondary small" onClick={onCreate}>
            New Session
          </button>
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="empty-panel">
          <p className="empty">No sessions yet.</p>
          <button onClick={onCreate}>Start Session</button>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map((item) => (
            <SessionListRow item={item} key={item.session.id} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function SessionListRow({ item, onOpen }: { item: SessionListItem; onOpen: (sessionId: string) => void }) {
  return (
    <button className="session-list-item" onClick={() => onOpen(item.session.id)}>
      <span className="session-list-title">{item.workspace.name}</span>
      <span>
        {item.session.agentName} · {item.session.status} · {formatRelativeTime(item.lastActivityAt)}
      </span>
      <span className="session-list-path">{item.workspace.path}</span>
      <span className="session-badges">
        {item.pendingPermission ? <strong>Approval: {item.pendingPermission.title}</strong> : null}
        {item.hasReviewArtifacts ? <strong>{item.reviewArtifactCount} review items</strong> : null}
      </span>
    </button>
  );
}

function SessionWorkspacePane(props: {
  busy: boolean;
  codex: ConnectionStatus;
  currentSession: SessionDetail | null;
  liveAssistant: string;
  selectedWorkspace: Workspace | null;
  workspaces: Workspace[];
  onCreateSession: () => void;
  onCreateWorkspace: (path: string) => Promise<void>;
  onOpenDiffFallback: () => void;
  onOpenReviewArtifact: (artifactId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSendPrompt: (prompt: string) => Promise<void>;
}) {
  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Workspace</h2>
        </div>
        <WorkspaceForm busy={props.busy} onCreateWorkspace={props.onCreateWorkspace} />
        <WorkspaceList
          currentWorkspaceId={props.selectedWorkspace?.id ?? null}
          onSelectWorkspace={props.onSelectWorkspace}
          workspaces={props.workspaces}
        />
      </section>

      <section className="section session-section">
        <div className="section-head">
          <h2>Session</h2>
          <div className="section-actions">
            {props.currentSession ? (
              <button className="secondary small" disabled={props.busy} onClick={props.onOpenDiffFallback}>
                Diff
              </button>
            ) : null}
            {props.currentSession ? <span className="muted">{props.currentSession.session.status}</span> : null}
          </div>
        </div>
        <SessionPane {...props} />
      </section>
    </>
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
      <button disabled={busy} type="submit">
        Add
      </button>
    </form>
  );
}

function WorkspaceList({
  currentWorkspaceId,
  onSelectWorkspace,
  workspaces
}: {
  currentWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  workspaces: Workspace[];
}) {
  if (workspaces.length === 0) {
    return <p className="empty">No workspaces yet.</p>;
  }

  return (
    <div className="workspace-list">
      {workspaces.map((workspace) => (
        <button
          className={`workspace-item ${workspace.id === currentWorkspaceId ? "selected" : ""}`}
          key={workspace.id}
          onClick={() => onSelectWorkspace(workspace.id)}
        >
          <strong>{workspace.name}</strong>
          <span>{workspace.path}</span>
        </button>
      ))}
    </div>
  );
}

function SessionPane({
  busy,
  codex,
  currentSession,
  liveAssistant,
  onCreateSession,
  onOpenReviewArtifact,
  onSendPrompt,
  selectedWorkspace
}: {
  busy: boolean;
  codex: ConnectionStatus;
  currentSession: SessionDetail | null;
  liveAssistant: string;
  onCreateSession: () => void;
  onOpenReviewArtifact: (artifactId: string) => void;
  onSendPrompt: (prompt: string) => Promise<void>;
  selectedWorkspace: Workspace | null;
}) {
  if (!selectedWorkspace) {
    return <p className="empty">Create or select a workspace to start.</p>;
  }

  if (!currentSession || currentSession.workspace.id !== selectedWorkspace.id) {
    return (
      <div className="start-session">
        <p className="muted">{selectedWorkspace.path}</p>
        <button disabled={codex.state !== "ready" || busy} onClick={onCreateSession}>
          New Codex Session
        </button>
      </div>
    );
  }

  const waitingApproval = currentSession.session.status === "waiting_approval";
  const running = currentSession.session.status === "running" || waitingApproval;
  const timelineEntries = buildTimelineEntries(currentSession);

  return (
    <>
      <div className="timeline" id="timeline">
        {currentSession.failureMessage ? <div className="notice error">{currentSession.failureMessage}</div> : null}
        {waitingApproval ? (
          <div className="notice approval">
            Waiting for approval: {currentSession.pendingPermission?.title ?? "Permission requested"}
          </div>
        ) : null}
        {timelineEntries.map((entry) =>
          entry.kind === "message" ? (
            <MessageBubble key={`message-${entry.message.id}`} message={entry.message} />
          ) : (
            <ReviewArtifactCard artifact={entry.artifact} key={`artifact-${entry.artifact.id}`} onOpen={onOpenReviewArtifact} />
          )
        )}
        {liveAssistant ? <MessageBubble live message={liveMessage(currentSession.session.id, liveAssistant)} /> : null}
      </div>
      <PromptComposer busy={busy} disabled={running} waitingApproval={waitingApproval} onSendPrompt={onSendPrompt} />
    </>
  );
}

function PromptComposer({
  busy,
  disabled,
  onSendPrompt,
  waitingApproval
}: {
  busy: boolean;
  disabled: boolean;
  onSendPrompt: (prompt: string) => Promise<void>;
  waitingApproval: boolean;
}) {
  const [prompt, setPrompt] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    await onSendPrompt(trimmed);
    setPrompt("");
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        disabled={disabled}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={waitingApproval ? "Resolve approval before sending another prompt" : "Ask Codex..."}
        rows={3}
        value={prompt}
      />
      <button disabled={disabled || busy} type="submit">
        Send
      </button>
    </form>
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
    <button className="review-card" onClick={() => onOpen(artifact.id)}>
      <span className="message-role">{artifact.kind}</span>
      <strong>{artifact.title}</strong>
      <span>{artifact.summary}</span>
      <small>
        {artifact.source}
        {artifact.toolCallId ? ` · ${artifact.toolCallId}` : ""}
      </small>
    </button>
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
  if (!permission || currentSession?.session.status !== "waiting_approval") {
    return null;
  }

  return (
    <div className="sheet-backdrop">
      <section aria-label="Approval request" className="approval-sheet">
        <div className="section-head">
          <div>
            <p className="eyebrow">{permission.kind}</p>
            <h2>{permission.title}</h2>
          </div>
          <button className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="approval-context">
          <span>{currentSession.workspace.name}</span>
          <span>{currentSession.session.agentName}</span>
        </div>
        <pre className="tool-summary">{toolSummary(permission.toolCall)}</pre>
        <div className="approval-actions">
          {permission.options.map((option) => (
            <PermissionOptionButton
              busy={busy}
              key={option.optionId}
              onResolve={() => onResolve(permission, option.optionId)}
              option={option}
            />
          ))}
        </div>
      </section>
    </div>
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
    <button className={`approval-option ${option.kind}`} disabled={busy || isAlways} onClick={onResolve}>
      <span>{option.name}</span>
      {isAlways ? <small>Not available yet</small> : null}
    </button>
  );
}

function ReviewOverlay({ artifact, onClose }: { artifact: ReviewArtifact | null; onClose: () => void }) {
  if (!artifact) {
    return null;
  }

  return (
    <div className="sheet-backdrop">
      <section aria-label="Review artifact" className="review-overlay">
        <div className="section-head">
          <div>
            <p className="eyebrow">{artifact.kind}</p>
            <h2>{artifact.title}</h2>
          </div>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">{artifact.summary}</p>
        <ReviewPayload artifact={artifact} />
      </section>
    </div>
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
        if (!part || typeof part !== "object") {
          return "";
        }
        const partValue = part as Record<string, unknown>;
        return typeof partValue.text === "string" ? partValue.text : "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) {
      return text;
    }
  }
  return JSON.stringify(toolCall, null, 2);
}

type TimelineEntry =
  | { kind: "message"; message: ChatMessage; timestamp: number; index: number }
  | { kind: "artifact"; artifact: ReviewArtifactSummary; timestamp: number; index: number };

function buildTimelineEntries(detail: SessionDetail): TimelineEntry[] {
  const messages = detail.messages.map((message, index): TimelineEntry => ({
    kind: "message",
    message,
    timestamp: timestampValue(message.createdAt),
    index
  }));
  const artifacts = detail.reviewArtifacts.map((artifact, index): TimelineEntry => ({
    kind: "artifact",
    artifact,
    timestamp: timestampValue(artifact.createdAt),
    index: detail.messages.length + index
  }));

  return [...messages, ...artifacts].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    return left.index - right.index;
  });
}

function timestampValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
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
    case "timeline_item_upsert":
      return sessions;
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
  if (Number.isNaN(timestamp)) {
    return value;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
