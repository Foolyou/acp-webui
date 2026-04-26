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

type PermissionOption = {
  optionId: string;
  name: string;
  kind: string;
};

type PermissionRequest = {
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

type SessionDetail = {
  session: Session;
  workspace: Workspace;
  messages: ChatMessage[];
  reviewArtifacts: ReviewArtifactSummary[];
  pendingPermission?: PermissionRequest | null;
  failureMessage?: string | null;
};

type ReviewArtifactSummary = {
  id: string;
  sessionId: string;
  toolCallId?: string | null;
  kind: string;
  title: string;
  summary: string;
  source: string;
  createdAt: string;
};

type ReviewArtifact = ReviewArtifactSummary & {
  payload: unknown;
};

type InboxItem = {
  session: Session;
  workspace: Workspace;
  permission: PermissionRequest;
};

type RealtimeEvent =
  | { type: "connection_status"; status: ConnectionStatus }
  | { type: "session_status"; sessionId: string; status: string }
  | { type: "text_delta"; sessionId: string; delta: string }
  | { type: "assistant_message"; sessionId: string; content: string }
  | { type: "permission_requested"; permission: PermissionRequest }
  | { type: "permission_resolved"; sessionId: string; permissionId: string }
  | { type: "review_artifact"; artifact: ReviewArtifactSummary }
  | { type: "error"; message: string };

type AppData = {
  codex: ConnectionStatus;
  inbox: InboxItem[];
};

type State = {
  codex: ConnectionStatus;
  socketState: "connecting" | "connected" | "disconnected";
  view: "inbox" | "session";
  workspaces: Workspace[];
  inbox: InboxItem[];
  currentWorkspaceId: string | null;
  currentSession: SessionDetail | null;
  activeReview: ReviewArtifact | null;
  liveAssistant: string;
  busy: boolean;
  error: string | null;
};

const state: State = {
  codex: { state: "starting", message: "Loading app state" },
  socketState: "connecting",
  view: "inbox",
  workspaces: [],
  inbox: [],
  currentWorkspaceId: localStorage.getItem("currentWorkspaceId"),
  currentSession: null,
  activeReview: null,
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
  state.inbox = appState.inbox;
  const sessionId = localStorage.getItem("currentSessionId");
  if (sessionId) {
    await loadSession(sessionId);
    state.view = "session";
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
  if (state.currentSession.pendingPermission) {
    upsertInboxItemFromPermission(state.currentSession.pendingPermission);
  }
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
    case "permission_requested":
      upsertInboxItemFromPermission(event.permission);
      if (state.currentSession?.session.id === event.permission.sessionId) {
        state.currentSession.pendingPermission = event.permission;
        state.currentSession.session.status = "waiting_approval";
      }
      break;
    case "permission_resolved":
      state.inbox = state.inbox.filter((item) => item.permission.id !== event.permissionId);
      if (state.currentSession?.session.id === event.sessionId) {
        state.currentSession.pendingPermission = null;
      }
      break;
    case "review_artifact":
      if (state.currentSession?.session.id === event.artifact.sessionId) {
        upsertReviewArtifact(event.artifact);
      }
      break;
    case "error":
      state.error = event.message;
      break;
  }
  render();
}

function upsertReviewArtifact(artifact: ReviewArtifactSummary) {
  if (!state.currentSession) {
    return;
  }
  const existingIndex = state.currentSession.reviewArtifacts.findIndex((item) => item.id === artifact.id);
  if (existingIndex >= 0) {
    state.currentSession.reviewArtifacts[existingIndex] = artifact;
  } else {
    state.currentSession.reviewArtifacts.push(artifact);
  }
}

function upsertInboxItemFromPermission(permission: PermissionRequest) {
  const existing = state.inbox.find((item) => item.session.id === permission.sessionId);
  if (existing) {
    existing.permission = permission;
    existing.session.status = "waiting_approval";
    return;
  }
  if (state.currentSession?.session.id === permission.sessionId) {
    state.inbox.unshift({
      session: state.currentSession.session,
      workspace: state.currentSession.workspace,
      permission
    });
  }
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

      <nav class="bottom-nav" aria-label="Primary">
        <button class="${state.view === "inbox" ? "active" : ""}" data-view="inbox">Inbox</button>
        <button class="${state.view === "session" ? "active" : ""}" data-view="session">Session</button>
      </nav>

      ${state.view === "inbox" ? inboxPane() : sessionWorkspacePane()}
      ${approvalSheet()}
      ${reviewOverlay()}
    </main>
  `;

  bindEvents();
}

function inboxPane() {
  return `
    <section class="section">
      <div class="section-head">
        <h2>Needs Approval</h2>
        <span class="muted">${state.inbox.length}</span>
      </div>
      ${
        state.inbox.length === 0
          ? `<p class="empty">No approvals waiting.</p>`
          : `<div class="inbox-list">${state.inbox.map(renderInboxItem).join("")}</div>`
      }
    </section>
  `;
}

function renderInboxItem(item: InboxItem) {
  return `
    <button class="inbox-item" data-session="${escapeHtml(item.session.id)}">
      <span class="inbox-title">${escapeHtml(item.permission.title)}</span>
      <span>${escapeHtml(item.workspace.name)} · ${escapeHtml(item.session.agentName)} · ${escapeHtml(item.session.status)}</span>
      <small>${escapeHtml(item.permission.kind)}</small>
    </button>
  `;
}

function sessionWorkspacePane() {
  return `

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
          <div class="section-actions">
            ${state.currentSession ? `<button id="open-diff-fallback" class="secondary small" ${state.busy ? "disabled" : ""}>Diff</button>` : ""}
            ${state.currentSession ? `<span class="muted">${escapeHtml(state.currentSession.session.status)}</span>` : ""}
          </div>
        </div>
        ${sessionPane()}
      </section>
  `;
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

  const waitingApproval = state.currentSession.session.status === "waiting_approval";
  const running = state.currentSession.session.status === "running" || waitingApproval;
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
      ${state.currentSession.failureMessage ? `<div class="notice error">${escapeHtml(state.currentSession.failureMessage)}</div>` : ""}
      ${waitingApproval ? `<div class="notice approval">Waiting for approval: ${escapeHtml(state.currentSession.pendingPermission?.title ?? "Permission requested")}</div>` : ""}
      ${messages.map(renderMessage).join("")}
      ${state.currentSession.reviewArtifacts.map(renderReviewArtifactCard).join("")}
      ${live}
    </div>
    <form id="prompt-form" class="composer">
      <textarea id="prompt-input" placeholder="${waitingApproval ? "Resolve approval before sending another prompt" : "Ask Codex..."}" rows="3" ${running ? "disabled" : ""}></textarea>
      <button type="submit" ${running || state.busy ? "disabled" : ""}>Send</button>
    </form>
  `;
}

function renderReviewArtifactCard(artifact: ReviewArtifactSummary) {
  return `
    <button class="review-card" data-review-artifact="${escapeHtml(artifact.id)}">
      <span class="message-role">${escapeHtml(artifact.kind)}</span>
      <strong>${escapeHtml(artifact.title)}</strong>
      <span>${escapeHtml(artifact.summary)}</span>
      <small>${escapeHtml(artifact.source)}${artifact.toolCallId ? ` · ${escapeHtml(artifact.toolCallId)}` : ""}</small>
    </button>
  `;
}

function reviewOverlay() {
  const artifact = state.activeReview;
  if (!artifact) {
    return "";
  }
  return `
    <div class="sheet-backdrop">
      <section class="review-overlay" aria-label="Review artifact">
        <div class="section-head">
          <div>
            <p class="eyebrow">${escapeHtml(artifact.kind)}</p>
            <h2>${escapeHtml(artifact.title)}</h2>
          </div>
          <button id="close-review" class="secondary">Close</button>
        </div>
        <p class="muted">${escapeHtml(artifact.summary)}</p>
        ${renderReviewPayload(artifact)}
      </section>
    </div>
  `;
}

function renderReviewPayload(artifact: ReviewArtifact) {
  if (artifact.kind === "diff") {
    return renderDiffPayload(artifact.payload);
  }
  if (artifact.kind === "markdown") {
    return renderMarkdownPayload(artifact.payload);
  }
  if (artifact.kind === "terminal") {
    return `<pre class="review-pre">${escapeHtml(payloadText(artifact.payload))}</pre>`;
  }
  return `<pre class="review-pre">${escapeHtml(JSON.stringify(artifact.payload, null, 2))}</pre>`;
}

function renderDiffPayload(payload: unknown) {
  const diff = payloadText(payload);
  const files = diff
    .split("\n")
    .filter((line) => line.startsWith("diff --git "))
    .map((line) => line.split(" b/")[1] ?? line)
    .map(escapeHtml);
  const hunks = diff
    .split("\n")
    .filter((line) => line.startsWith("@@"))
    .map(escapeHtml);
  return `
    ${files.length ? `<div class="review-nav">${files.map((file) => `<span>${file}</span>`).join("")}</div>` : ""}
    ${hunks.length ? `<div class="review-nav hunks">${hunks.map((hunk) => `<span>${hunk}</span>`).join("")}</div>` : ""}
    <pre class="review-pre diff">${escapeHtml(diff || "No diff content.")}</pre>
  `;
}

function renderMarkdownPayload(payload: unknown) {
  const text = payloadText(payload);
  const html = text
    .split("\n")
    .map((line) => {
      if (line.startsWith("### ")) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith("# ")) return `<h2>${escapeHtml(line.slice(2))}</h2>`;
      if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
      if (!line.trim()) return "";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("");
  return `
    <div class="markdown-preview">${html}</div>
    <details class="raw-details">
      <summary>Raw</summary>
      <pre class="review-pre">${escapeHtml(text)}</pre>
    </details>
  `;
}

function payloadText(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;
    for (const key of ["diff", "markdown", "content", "text", "output"]) {
      if (typeof value[key] === "string") {
        return value[key] as string;
      }
    }
  }
  return JSON.stringify(payload, null, 2);
}

function approvalSheet() {
  const permission = state.currentSession?.pendingPermission;
  if (!permission || state.currentSession?.session.status !== "waiting_approval") {
    return "";
  }

  return `
    <div class="sheet-backdrop">
      <section class="approval-sheet" aria-label="Approval request">
        <div class="section-head">
          <div>
            <p class="eyebrow">${escapeHtml(permission.kind)}</p>
            <h2>${escapeHtml(permission.title)}</h2>
          </div>
          <button id="cancel-approval" class="secondary" ${state.busy ? "disabled" : ""}>Cancel</button>
        </div>
        <div class="approval-context">
          <span>${escapeHtml(state.currentSession.workspace.name)}</span>
          <span>${escapeHtml(state.currentSession.session.agentName)}</span>
        </div>
        <pre class="tool-summary">${escapeHtml(toolSummary(permission.toolCall))}</pre>
        <div class="approval-actions">
          ${permission.options.map(renderPermissionOption).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderPermissionOption(option: PermissionOption) {
  const disabled = option.kind === "allow_always" || option.kind === "reject_always" || state.busy;
  const copy = option.kind === "allow_always" || option.kind === "reject_always" ? "Not available yet" : "";
  return `
    <button class="approval-option ${escapeHtml(option.kind)}" data-permission-option="${escapeHtml(option.optionId)}" ${disabled ? "disabled" : ""}>
      <span>${escapeHtml(option.name)}</span>
      ${copy ? `<small>${copy}</small>` : ""}
    </button>
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
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view === "inbox" || view === "session") {
        state.view = view;
        render();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".inbox-item").forEach((button) => {
    button.addEventListener("click", async () => {
      const sessionId = button.dataset.session;
      if (!sessionId) {
        return;
      }
      await withBusy(async () => {
        await loadSession(sessionId);
        state.view = "session";
      });
    });
  });

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
      state.view = "session";
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
      state.view = "session";
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
      state.view = "session";
      localStorage.setItem("currentSessionId", state.currentSession.session.id);
    });
  });

  document.querySelector<HTMLButtonElement>("#open-diff-fallback")?.addEventListener("click", async () => {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) {
      return;
    }
    await withBusy(async () => {
      const response = await api<{ artifact: ReviewArtifact }>(`/api/sessions/${sessionId}/review-diff`);
      state.activeReview = response.artifact;
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-review-artifact]").forEach((button) => {
    button.addEventListener("click", async () => {
      const artifactId = button.dataset.reviewArtifact;
      const sessionId = state.currentSession?.session.id;
      if (!artifactId || !sessionId) {
        return;
      }
      await withBusy(async () => {
        state.activeReview = await api<ReviewArtifact>(`/api/sessions/${sessionId}/review-artifacts/${artifactId}`);
      });
    });
  });

  document.querySelector<HTMLButtonElement>("#close-review")?.addEventListener("click", () => {
    state.activeReview = null;
    render();
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

  document.querySelectorAll<HTMLButtonElement>("[data-permission-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const optionId = button.dataset.permissionOption;
      const permission = state.currentSession?.pendingPermission;
      if (!optionId || !permission) {
        return;
      }
      await withBusy(async () => {
        await api<PermissionRequest>(`/api/permission-requests/${permission.id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ optionId })
        });
        state.currentSession!.pendingPermission = null;
        state.currentSession!.session.status = "running";
        state.inbox = state.inbox.filter((item) => item.permission.id !== permission.id);
      });
    });
  });

  document.querySelector<HTMLButtonElement>("#cancel-approval")?.addEventListener("click", async () => {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) {
      return;
    }
    await withBusy(async () => {
      state.currentSession = await api<SessionDetail>(`/api/sessions/${sessionId}/cancel`, {
        method: "POST"
      });
      state.inbox = state.inbox.filter((item) => item.session.id !== sessionId);
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
