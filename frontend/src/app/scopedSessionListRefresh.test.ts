import { describe, expect, test } from "vitest";
import type { RealtimeEvent } from "../types";
import { shouldRefreshScopedSessionList } from "./scopedSessionListRefresh";

const event: RealtimeEvent = {
  type: "session_list_changed",
  workspaceId: "workspace-1",
  agentId: "agent-1",
  count: 3
};

describe("shouldRefreshScopedSessionList", () => {
  test("refreshes when the event matches the current workspace-agent scope", () => {
    expect(
      shouldRefreshScopedSessionList(event, {
        currentWorkspaceId: "workspace-1",
        currentAgentId: "agent-1"
      })
    ).toBe(true);
  });

  test("ignores session list changes for other workspaces", () => {
    expect(
      shouldRefreshScopedSessionList(event, {
        currentWorkspaceId: "workspace-2",
        currentAgentId: "agent-1"
      })
    ).toBe(false);
  });

  test("ignores session list changes for other agents", () => {
    expect(
      shouldRefreshScopedSessionList(event, {
        currentWorkspaceId: "workspace-1",
        currentAgentId: "agent-2"
      })
    ).toBe(false);
  });

  test("ignores other realtime events", () => {
    expect(
      shouldRefreshScopedSessionList(
        { type: "session_status", sessionId: "session-1", status: "running" },
        {
          currentWorkspaceId: "workspace-1",
          currentAgentId: "agent-1"
        }
      )
    ).toBe(false);
  });
});
