import { describe, expect, test } from "vitest";
import type { PermissionRequest, SessionDetail } from "./types";
import { applyRealtimeEvent } from "./realtime";

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: "session-1",
      workspaceId: "workspace-1",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      status: "idle",
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
    activeTurn: null,
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

function permission(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "permission-1",
    sessionId: "session-1",
    acpSessionId: "acp-session-1",
    title: "Run command",
    kind: "exec",
    status: "pending",
    toolCall: {},
    options: [],
    createdAt: "2026-04-30T00:00:01Z",
    ...overrides
  };
}

describe("applyRealtimeEvent", () => {
  test("reconciles queued prompts by replacing the persisted queue snapshot", () => {
    const result = applyRealtimeEvent(
      { currentSession: detail(), inbox: [], liveAssistant: "", error: null },
      {
        type: "queued_prompts_updated",
        sessionId: "session-1",
        queuedPrompts: [
          {
            id: "queue-1",
            sessionId: "session-1",
            messageId: "message-1",
            prompt: "next prompt",
            status: "queued",
            position: 1,
            createdAt: "2026-04-30T00:00:01Z"
          }
        ]
      }
    );

    expect(result.currentSession?.queuedPrompts?.map((item) => item.prompt)).toEqual(["next prompt"]);
  });

  test("updates active turn timing and status from realtime events", () => {
    const result = applyRealtimeEvent(
      { currentSession: detail(), inbox: [], liveAssistant: "", error: null },
      {
        type: "active_turn_updated",
        sessionId: "session-1",
        status: "running",
        activeTurn: {
          startedAt: "2026-04-30T00:00:00Z",
          status: "running"
        }
      }
    );

    expect(result.currentSession?.session.status).toBe("running");
    expect(result.currentSession?.activeTurn?.startedAt).toBe("2026-04-30T00:00:00Z");
  });

  test("does not clear newer live text when an older assistant segment is upserted", () => {
    const result = applyRealtimeEvent(
      { currentSession: detail(), inbox: [], liveAssistant: "new suffix", error: null },
      {
        type: "timeline_item_upsert",
        item: {
          kind: "message",
          id: "assistant-1",
          sessionId: "session-1",
          timestamp: "2026-04-30T00:00:02Z",
          status: "idle",
          role: "assistant",
          content: "old prefix"
        }
      }
    );

    expect(result.liveAssistant).toBe("new suffix");
  });

  test("clears live text when the persisted assistant message contains it", () => {
    const result = applyRealtimeEvent(
      { currentSession: detail(), inbox: [], liveAssistant: "complete text", error: null },
      {
        type: "timeline_item_upsert",
        item: {
          kind: "message",
          id: "assistant-1",
          sessionId: "session-1",
          timestamp: "2026-04-30T00:00:02Z",
          status: "idle",
          role: "assistant",
          content: "complete text"
        }
      }
    );

    expect(result.liveAssistant).toBe("");
  });

  test("uses resolved permission status when no active turn remains", () => {
    const result = applyRealtimeEvent(
      {
        currentSession: detail({
          session: {
            ...detail().session,
            status: "waiting_approval"
          },
          pendingPermission: permission(),
          pendingPermissions: [permission()]
        }),
        inbox: [],
        liveAssistant: "",
        error: null
      },
      {
        type: "permission_resolved",
        sessionId: "session-1",
        permissionId: "permission-1",
        nextPermission: null,
        status: "idle",
        pendingApprovalCount: 0,
        queuedApprovalCount: 0
      }
    );

    expect(result.currentSession?.session.status).toBe("idle");
    expect(result.currentSession?.pendingPermission).toBeNull();
  });
});
