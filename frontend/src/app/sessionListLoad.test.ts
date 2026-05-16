import { describe, expect, test } from "vitest";
import { canApplySessionListLoad, type SessionListLoadToken } from "./sessionListLoad";

const currentScope = {
  currentWorkspaceId: "workspace-1",
  currentAgentId: "agent-1"
};

describe("canApplySessionListLoad", () => {
  test("applies the latest matching workspace-agent load", () => {
    expect(
      canApplySessionListLoad(
        { generation: 2, workspaceId: "workspace-1", agentId: "agent-1" },
        2,
        currentScope
      )
    ).toBe(true);
  });

  test("rejects an older workspace-agent load for the same scope", () => {
    expect(
      canApplySessionListLoad(
        { generation: 1, workspaceId: "workspace-1", agentId: "agent-1" },
        2,
        currentScope
      )
    ).toBe(false);
  });

  test("rejects a latest load for a workspace that is no longer current", () => {
    expect(
      canApplySessionListLoad(
        { generation: 2, workspaceId: "workspace-2", agentId: "agent-1" },
        2,
        currentScope
      )
    ).toBe(false);
  });

  test("rejects a latest load for an agent that is no longer selected", () => {
    expect(
      canApplySessionListLoad(
        { generation: 2, workspaceId: "workspace-1", agentId: "agent-2" },
        2,
        currentScope
      )
    ).toBe(false);
  });

  test("applies the latest global load without workspace-agent scope checks", () => {
    const token: SessionListLoadToken = { generation: 2 };

    expect(canApplySessionListLoad(token, 2, currentScope)).toBe(true);
  });

  test("applies the latest workspace cockpit load without requiring an agent scope", () => {
    expect(
      canApplySessionListLoad(
        { generation: 2, workspaceId: "workspace-1" },
        2,
        { currentWorkspaceId: "workspace-1", currentAgentId: null }
      )
    ).toBe(true);
  });
});
