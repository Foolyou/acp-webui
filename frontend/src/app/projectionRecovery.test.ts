import { describe, expect, test } from "vitest";
import type { UiState } from "./types";
import {
  canApplyProjectionRecovery,
  canApplyRecoveredSessionDetail,
  canApplyRecoveredSessionList,
  type ProjectionRecoveryToken
} from "./projectionRecovery";

const token: ProjectionRecoveryToken = {
  generation: 2,
  workspaceId: "workspace-a",
  agentId: "codex",
  sessionId: "session-a"
};

function state(overrides: Partial<UiState> = {}): UiState {
  return {
    codex: { state: "ready" },
    agents: [],
    socketState: "connected",
    initialized: true,
    workspaces: [],
    inbox: [],
    transcription: { available: false, maxAudioBytes: 0 },
    access: null,
    sessions: [],
    sessionsLoading: false,
    currentWorkspaceId: "workspace-a",
    currentAgentId: "codex",
    currentAgentIdByWorkspace: {},
    currentSession: {
      session: {
        id: "session-a",
        workspaceId: "workspace-a",
        agentId: "codex",
        agentName: "Codex",
        permissionMode: "manual",
        status: "idle",
        createdAt: "2026-04-30T00:00:00Z",
        updatedAt: "2026-04-30T00:00:00Z"
      },
      workspace: {
        id: "workspace-a",
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
        state: "live",
        continuable: true,
        restorable: false,
        restoring: false
      },
      continuable: true
    },
    activeReview: null,
    liveAssistant: "",
    busy: false,
    creatingSessionWorkspaceId: null,
    creatingSessionAgentId: null,
    creatingSessionPermissionMode: null,
    error: null,
    auth: null,
    ...overrides
  };
}

describe("projection recovery guards", () => {
  test("reject stale recovery generations", () => {
    expect(canApplyProjectionRecovery(token, 2)).toBe(true);
    expect(canApplyProjectionRecovery(token, 3)).toBe(false);
  });

  test("applies recovered session lists only to the same route scope", () => {
    expect(canApplyRecoveredSessionList(token, 2, state())).toBe(true);
    expect(canApplyRecoveredSessionList(token, 2, state({ currentAgentId: "claude" }))).toBe(false);
    expect(canApplyRecoveredSessionList(token, 3, state())).toBe(false);
  });

  test("applies recovered session detail only to the currently viewed session", () => {
    expect(canApplyRecoveredSessionDetail(token, 2, state())).toBe(true);
    expect(
      canApplyRecoveredSessionDetail(
        token,
        2,
        state({ currentSession: { ...state().currentSession!, session: { ...state().currentSession!.session, id: "session-b" } } })
      )
    ).toBe(false);
  });
});
