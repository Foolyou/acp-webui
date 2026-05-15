import { describe, expect, test } from "vitest";
import { createSessionRouteTargets } from "./sessionCreationRoutes";
import type { SessionDetail } from "../types";

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
      path: "<project-path>",
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

describe("createSessionRouteTargets", () => {
  test("uses canonical workspace-agent routes when an agent is provided", () => {
    const targets = createSessionRouteTargets("workspace-1", "agent-codex", detail());

    expect(targets.creating).toEqual({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/new",
      params: { workspaceId: "workspace-1", agentId: "agent-codex" }
    });
    expect(targets.detail).toEqual({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId",
      params: { workspaceId: "workspace-1", agentId: "codex", sessionId: "session-1" },
      replace: true
    });
  });

  test("keeps legacy routes when no agent is provided", () => {
    const targets = createSessionRouteTargets("workspace-1", undefined, detail());

    expect(targets.creating).toEqual({
      to: "/workspaces/$workspaceId/sessions/new",
      params: { workspaceId: "workspace-1" }
    });
    expect(targets.detail).toEqual({
      to: "/workspaces/$workspaceId/sessions/$sessionId",
      params: { workspaceId: "workspace-1", sessionId: "session-1" },
      replace: true
    });
  });
});
