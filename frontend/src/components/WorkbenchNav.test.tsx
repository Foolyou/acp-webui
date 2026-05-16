import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppRouterContext, UiState } from "../app/types";
import type { AgentRuntimeStatus, Workspace } from "../types";

const mocks = vi.hoisted(() => ({
  appContext: null as AppRouterContext | null,
  link: vi.fn()
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

vi.mock("@tanstack/react-router", () => ({
  Link: mocks.link
}));

vi.mock("../app/context", () => ({
  useAppContext: () => {
    if (!mocks.appContext) {
      throw new Error("Missing app context");
    }
    return mocks.appContext;
  }
}));

function agent(overrides: Partial<AgentRuntimeStatus> = {}): AgentRuntimeStatus {
  return {
    id: "agent-default",
    title: "Agent",
    enabled: true,
    status: { state: "idle" },
    permissionModes: [],
    launchControls: [],
    ...overrides
  };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-a",
    name: "Workspace",
    path: "workspace",
    createdAt: "2026-04-30T00:00:00Z",
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

function setContext(state: Partial<UiState>) {
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
    state: { ...baseState(), ...state }
  };
}

describe("WorkbenchNav", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    mocks.link.mockReset();
    mocks.link.mockReturnValue(null);
    mocks.appContext = null;
  });

  test("routes workspace shortcuts to remembered workspace-agent session routes", async () => {
    localStorage.setItem(
      "workspaceAgentNavigation",
      JSON.stringify({
        version: 1,
        currentAgentIdByWorkspace: { "workspace-a": "agent-remembered" }
      })
    );
    setContext({
      agents: [agent(), agent({ id: "agent-remembered" })],
      workspaces: [workspace()]
    });
    const { WorkbenchNav } = await import("./WorkbenchNav");

    renderToStaticMarkup(<WorkbenchNav onNavigate={vi.fn()} />);

    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/workspaces/$workspaceId/agents/$agentId/sessions",
        params: { workspaceId: "workspace-a", agentId: "agent-remembered" }
      }),
      undefined
    );
  });

  test("keeps workspace shortcuts on the safe legacy route when no agent resolves", async () => {
    setContext({
      agents: [agent({ enabled: false })],
      workspaces: [workspace()]
    });
    const { WorkbenchNav } = await import("./WorkbenchNav");

    renderToStaticMarkup(<WorkbenchNav onNavigate={vi.fn()} />);

    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: "workspace-a" }
      }),
      undefined
    );
  });
});
