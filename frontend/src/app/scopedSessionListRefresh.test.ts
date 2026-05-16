import { describe, expect, test } from "vitest";
import type { RealtimeEvent } from "../types";
import {
  beginScopedSessionListRefresh,
  canApplyScopedSessionListRefresh,
  createScopedSessionListRefreshState,
  shouldRefreshScopedSessionList,
  syncScopedSessionListRefreshScope
} from "./scopedSessionListRefresh";

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

  test("refreshes any agent change for the current workspace cockpit scope", () => {
    expect(
      shouldRefreshScopedSessionList(event, {
        currentWorkspaceId: "workspace-1",
        currentAgentId: null
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

describe("scoped session list refresh generation", () => {
  test("creates a workspace cockpit refresh token when no agent filter is active", () => {
    const state = createScopedSessionListRefreshState({
      currentWorkspaceId: "workspace-1",
      currentAgentId: null
    });

    const started = beginScopedSessionListRefresh(state, event);

    expect(started.token).toMatchObject({
      workspaceId: "workspace-1",
      agentId: null
    });
  });

  test("allows only the latest matching refresh request to apply", () => {
    let state = createScopedSessionListRefreshState({
      currentWorkspaceId: "workspace-1",
      currentAgentId: "agent-1"
    });

    const first = beginScopedSessionListRefresh(state, event);
    state = first.state;
    const second = beginScopedSessionListRefresh(state, event);
    state = second.state;

    expect(first.token).not.toBeNull();
    expect(second.token).not.toBeNull();
    expect(canApplyScopedSessionListRefresh(first.token!, state, state.scope)).toBe(false);
    expect(canApplyScopedSessionListRefresh(second.token!, state, state.scope)).toBe(true);
  });

  test("rejects a matching refresh after leaving and returning to the same scope", () => {
    let state = createScopedSessionListRefreshState({
      currentWorkspaceId: "workspace-1",
      currentAgentId: "agent-1"
    });
    const pending = beginScopedSessionListRefresh(state, event);
    state = pending.state;

    state = syncScopedSessionListRefreshScope(state, {
      currentWorkspaceId: "workspace-1",
      currentAgentId: "agent-2"
    });
    state = syncScopedSessionListRefreshScope(state, {
      currentWorkspaceId: "workspace-1",
      currentAgentId: "agent-1"
    });

    expect(pending.token).not.toBeNull();
    expect(canApplyScopedSessionListRefresh(pending.token!, state, state.scope)).toBe(false);
  });
});
