import "./style.css";

type ConnectionStatus = {
  state: "starting" | "ready" | "failed" | string;
  message?: string | null;
  agentInfo?: unknown;
};

type Workspace = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
};

type Session = {
  id: string;
  workspaceId: string;
  agentName: string;
  acpSessionId?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  status: string;
  createdAt: string;
};

type SessionDetail = {
  session: Session;
  workspace: Workspace;
  messages: ChatMessage[];
};

type RealtimeEvent =
  | { type: "connection_status"; status: ConnectionStatus }
  | { type: "session_status"; sessionId: string; status: string }
  | { type: "text_delta"; sessionId: string; delta: string }
  | { type: "assistant_message"; sessionId: string; content: string }
  | { type: "unsupported_permission"; sessionId: string; message: string }
  | { type: "error"; message: string };

type AppData = {
  codex: ConnectionStatus;
};

type State = {
  codex: ConnectionStatus;
  socketState: "connecting" | "connected" | "disconnected";
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  currentSession: SessionDetail | null;
  liveAssistant: string;
  busy: boolean;
  error: string | null;
};

const state: State = {
  codex: { state: "starting", message: "Loading app state" },
  socketState: "connecting",
  workspaces: [],
  currentWorkspaceId: localStorage.getItem("currentWorkspaceId"),
  currentSession: null,
  liveAssistant: "",
  busy: false,
  error: null
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app");
}
const root = app;

init().catch((error) => {
  state.error = errorMessage(error);
  render();
});

async function init() {
  connectSocket();
  const [appState] = await Promise.all([api<AppData>("/api/app-state"), loadWorkspaces()]);
  state.codex = appState.codex;
  const sessionId = localStorage.getItem("currentSessionId");
  if (sessionId) {
    await loadSession(sessionId);
  }
  render();
}

async function loadWorkspaces() {
  state.workspaces = await api<Workspace[]>("/api/workspaces");
  if (!state.currentWorkspaceId && state.workspaces.length > 0) {
    state.currentWorkspaceId = state.workspaces[0].id;
  }
}

async function loadSession(sessionId: string) {
  state.currentSession = await api<SessionDetail>(`/api/sessions/${sessionId}`);
  state.currentWorkspaceId = state.currentSession.workspace.id;
  state.liveAssistant = "";
  localStorage.setItem("currentWorkspaceId", state.currentWorkspaceId);
  localStorage.setItem("currentSessionId", sessionId);
}

function connectSocket() {
  state.socketState = "connecting";
  render();

  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${window.location.host}/api/ws`);

  socket.addEventListener("open", () => {
    state.socketState = "connected";
    render();
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as RealtimeEvent;
    applyRealtimeEvent(message);
  });

  socket.addEventListener("close", () => {
    state.socketState = "disconnected";
    render();
    window.setTimeout(connectSocket, 1200);
  });

  socket.addEventListener("error", () => {
    state.socketState = "disconnected";
    render();
  });
}

function applyRealtimeEvent(event: RealtimeEvent) {
  switch (event.type) {
    case "connection_status":
      state.codex = event.status;
      break;
    case "session_status":
      if (state.currentSession?.session.id === event.sessionId) {
        state.currentSession.session.status = event.status;
      }
      break;
    case "text_delta":
      if (state.currentSession?.session.id === event.sessionId) {
        state.liveAssistant += event.delta;
      }
      break;
    case "assistant_message":
      if (state.currentSession?.session.id === event.sessionId) {
        upsertAssistantMessage(event.content);
        state.liveAssistant = "";
      }
      break;
    case "unsupported_permission":
      if (state.currentSession?.session.id === event.sessionId) {
        state.error = event.message;
        void loadSession(event.sessionId).catch((error) => {
          state.error = errorMessage(error);
          render();
        });
      }
      break;
    case "error":
      state.error = event.message;
      break;
  }
  render();
}

function upsertAssistantMessage(content: string) {
  if (!state.currentSession) {
    return;
  }
  state.currentSession.messages.push({
    id: `live-${Date.now()}`,
    sessionId: state.currentSession.session.id,
    role: "assistant",
    content,
    status: "idle",
    createdAt: new Date().toISOString()
  });
}

function render() {
  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">ACP Web UI</p>
          <h1>Codex Session</h1>
        </div>
        <div class="status-stack">
          ${statusPill(state.codex.state, state.codex.message ?? "Codex")}
          ${statusPill(state.socketState, "Realtime")}
        </div>
      </header>

      ${state.error ? `<div class="notice error">${escapeHtml(state.error)}</div>` : ""}

      <section class="section">
        <div class="section-head">
          <h2>Workspace</h2>
        </div>
        ${workspaceForm()}
        ${workspaceList()}
      </section>

      <section class="section session-section">
        <div class="section-head">
          <h2>Session</h2>
          ${state.currentSession ? `<span class="muted">${escapeHtml(state.currentSession.session.status)}</span>` : ""}
        </div>
        ${sessionPane()}
      </section>
    </main>
  `;

  bindEvents();
}

function workspaceForm() {
  return `
    <form id="workspace-form" class="inline-form">
      <input id="workspace-path" name="path" placeholder="/home/user/project" autocomplete="off" />
      <button type="submit" ${state.busy ? "disabled" : ""}>Add</button>
    </form>
  `;
}

function workspaceList() {
  if (state.workspaces.length === 0) {
    return `<p class="empty">No workspaces yet.</p>`;
  }

  return `
    <div class="workspace-list">
      ${state.workspaces
        .map(
          (workspace) => `
            <button class="workspace-item ${workspace.id === state.currentWorkspaceId ? "selected" : ""}" data-workspace="${workspace.id}">
              <strong>${escapeHtml(workspace.name)}</strong>
              <span>${escapeHtml(workspace.path)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function sessionPane() {
  const workspace = selectedWorkspace();
  if (!workspace) {
    return `<p class="empty">Create or select a workspace to start.</p>`;
  }

  if (!state.currentSession || state.currentSession.workspace.id !== workspace.id) {
    return `
      <div class="start-session">
        <p class="muted">${escapeHtml(workspace.path)}</p>
        <button id="create-session" ${state.codex.state !== "ready" || state.busy ? "disabled" : ""}>New Codex Session</button>
      </div>
    `;
  }

  const running = state.currentSession.session.status === "running";
  const messages = [...state.currentSession.messages];
  const live = state.liveAssistant
    ? `
      <article class="message assistant live">
        <div class="message-role">assistant</div>
        <div class="message-content">${escapeHtml(state.liveAssistant)}</div>
      </article>
    `
    : "";

  return `
    <div class="timeline" id="timeline">
      ${messages.map(renderMessage).join("")}
      ${live}
    </div>
    <form id="prompt-form" class="composer">
      <textarea id="prompt-input" placeholder="Ask Codex..." rows="3" ${running ? "disabled" : ""}></textarea>
      <button type="submit" ${running || state.busy ? "disabled" : ""}>Send</button>
    </form>
  `;
}

function renderMessage(message: ChatMessage) {
  return `
    <article class="message ${escapeHtml(message.role)}">
      <div class="message-role">${escapeHtml(message.role)}</div>
      <div class="message-content">${escapeHtml(message.content)}</div>
    </article>
  `;
}

function statusPill(stateText: string, detail: string) {
  return `
    <div class="pill ${escapeHtml(stateText)}">
      <span>${escapeHtml(stateText)}</span>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function bindEvents() {
  document.querySelector<HTMLFormElement>("#workspace-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#workspace-path");
    const path = input?.value.trim() ?? "";
    if (!path) {
      state.error = "Workspace path is required.";
      render();
      return;
    }

    await withBusy(async () => {
      const workspace = await api<Workspace>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ path })
      });
      state.workspaces.unshift(workspace);
      state.currentWorkspaceId = workspace.id;
      state.currentSession = null;
      localStorage.setItem("currentWorkspaceId", workspace.id);
      localStorage.removeItem("currentSessionId");
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-workspace]").forEach((button) => {
    button.addEventListener("click", () => {
      const workspaceId = button.dataset.workspace ?? null;
      state.currentWorkspaceId = workspaceId;
      state.currentSession = null;
      state.liveAssistant = "";
      if (workspaceId) {
        localStorage.setItem("currentWorkspaceId", workspaceId);
      }
      localStorage.removeItem("currentSessionId");
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#create-session")?.addEventListener("click", async () => {
    const workspace = selectedWorkspace();
    if (!workspace) {
      return;
    }
    await withBusy(async () => {
      state.currentSession = await api<SessionDetail>(`/api/workspaces/${workspace.id}/sessions`, {
        method: "POST"
      });
      localStorage.setItem("currentSessionId", state.currentSession.session.id);
    });
  });

  document.querySelector<HTMLFormElement>("#prompt-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLTextAreaElement>("#prompt-input");
    const prompt = input?.value.trim() ?? "";
    if (!prompt || !state.currentSession) {
      return;
    }

    const sessionId = state.currentSession.session.id;
    await withBusy(async () => {
      const response = await api<{ message: ChatMessage }>(`/api/sessions/${sessionId}/prompt`, {
        method: "POST",
        body: JSON.stringify({ prompt })
      });
      state.currentSession?.messages.push(response.message);
      state.currentSession!.session.status = "running";
      state.liveAssistant = "";
      if (input) {
        input.value = "";
      }
    });
  });
}

function selectedWorkspace() {
  return state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId) ?? null;
}

async function withBusy(action: () => Promise<void>) {
  state.busy = true;
  state.error = null;
  render();
  try {
    await action();
  } catch (error) {
    state.error = errorMessage(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Keep the status text.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
