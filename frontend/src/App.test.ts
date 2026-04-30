import { describe, expect, test } from "vitest";
import { liveAssistantAfterSessionReconcile } from "./app/liveAssistant";
import type { SessionDetail } from "./types";

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: "session-1",
      workspaceId: "workspace-1",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      status: "running",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z"
    },
    workspace: {
      id: "workspace-1",
      name: "Workspace",
      path: "workspace",
      createdAt: "2026-04-30T00:00:00Z"
    },
    messages: [],
    queuedPrompts: [],
    activeTurn: {
      startedAt: "2026-04-30T00:00:00Z",
      status: "running"
    },
    reviewArtifacts: [],
    timeline: [],
    continuity: {
      state: "live",
      continuable: true,
      restorable: false,
      restoring: false
    },
    continuable: true,
    ...overrides
  };
}

describe("liveAssistantAfterSessionReconcile", () => {
  test("preserves unpersisted live text while the turn is active", () => {
    expect(liveAssistantAfterSessionReconcile("partial live text", detail())).toBe("partial live text");
  });

  test("clears live text once it is present in persisted timeline", () => {
    expect(
      liveAssistantAfterSessionReconcile(
        "partial live text",
        detail({
          timeline: [
            {
              kind: "message",
              id: "assistant-1",
              sessionId: "session-1",
              timestamp: "2026-04-30T00:00:02Z",
              status: "idle",
              role: "assistant",
              content: "partial live text"
            }
          ]
        })
      )
    ).toBe("");
  });

  test("clears live text when the reconciled session is idle", () => {
    expect(
      liveAssistantAfterSessionReconcile(
        "partial live text",
        detail({
          session: {
            ...detail().session,
            status: "idle"
          },
          activeTurn: null
        })
      )
    ).toBe("");
  });
});
