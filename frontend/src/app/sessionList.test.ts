import { describe, expect, test } from "vitest";
import type { SessionDetail, SessionListItem } from "../types";
import { applySessionListRealtime, sessionDetailToListItem, updateSessionListModel } from "./sessionList";

function sessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  const detail: SessionDetail = {
    session: {
      id: "session-a",
      workspaceId: "workspace-a",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      status: "idle",
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-18T00:00:00Z",
      nativeUpdatedAt: "2026-05-01T00:00:00Z"
    },
    workspace: {
      id: "workspace-a",
      name: "Workspace",
      path: "<project-path>",
      createdAt: "2026-05-01T00:00:00Z"
    },
    currentModel: null,
    configOptions: [],
    launchControlSummary: [],
    messages: [],
    queuedPrompts: [],
    activeTurn: null,
    reviewArtifacts: [],
    timeline: [],
    pendingPermission: null,
    pendingPermissions: [],
    pendingApprovalCount: 0,
    queuedApprovalCount: 0,
    continuity: {
      state: "live",
      continuable: true,
      restorable: false,
      restoring: false
    },
    continuable: true,
    viewOnlyReason: null,
    ...overrides
  };
  return detail;
}

describe("sessionDetailToListItem", () => {
  test("uses timeline activity instead of session metadata updates", () => {
    const item = sessionDetailToListItem(
      sessionDetail({
        timeline: [
          {
            kind: "message",
            id: "message-a",
            sessionId: "session-a",
            timestamp: "2026-05-15T00:00:00Z",
            status: "idle",
            role: "assistant",
            content: "Done"
          }
        ]
      })
    );

    expect(item.lastActivityAt).toBe("2026-05-15T00:00:00Z");
  });

  test("uses native activity instead of import time for native sessions", () => {
    const item = sessionDetailToListItem(
      sessionDetail({
        session: {
          ...sessionDetail().session,
          createdAt: "2026-05-18T00:00:00Z",
          updatedAt: "2026-05-18T00:00:00Z",
          nativeUpdatedAt: "2026-05-01T00:00:00Z",
          externalSessionId: "external-session-a"
        }
      })
    );

    expect(item.lastActivityAt).toBe("2026-05-01T00:00:00Z");
  });
});

function sessionListItem(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    session: sessionDetail().session,
    workspace: sessionDetail().workspace,
    lastActivityAt: "2026-05-01T00:00:00Z",
    currentModel: null,
    launchControlSummary: [],
    queuedPromptCount: 0,
    activeTurn: null,
    pendingPermission: null,
    queuedApprovalCount: 0,
    reviewArtifactCount: 0,
    hasReviewArtifacts: false,
    continuity: {
      state: "live",
      continuable: true,
      restorable: false,
      restoring: false
    },
    continuable: true,
    viewOnlyReason: null,
    ...overrides
  };
}

describe("session list realtime activity", () => {
  test("model updates do not bump last activity", () => {
    const [item] = updateSessionListModel([sessionListItem()], "session-a", {
      configId: "model",
      value: "gpt-5.5",
      name: "GPT-5.5"
    });

    expect(item.lastActivityAt).toBe("2026-05-01T00:00:00Z");
  });

  test("restore metadata events do not bump last activity", () => {
    const [item] = applySessionListRealtime(
      [sessionListItem()],
      {
        type: "session_restore_failed",
        sessionId: "session-a",
        message: "restore failed"
      },
      null
    );

    expect(item.lastActivityAt).toBe("2026-05-01T00:00:00Z");
  });
});
