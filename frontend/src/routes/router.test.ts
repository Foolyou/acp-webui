import { describe, expect, test, vi } from "vitest";

describe("workspace cockpit routes", () => {
  test("defines canonical workspace cockpit paths and compatibility agent paths", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    });
    const {
      workspaceSessionsRoute,
      sessionDetailRoute,
      workspaceAgentSessionsRoute,
      workspaceAgentNewSessionRoute,
      workspaceAgentSessionDetailRoute
    } = await import("./router");

    expect(workspaceSessionsRoute.fullPath).toBe("/workspaces/$workspaceId/sessions");
    expect(sessionDetailRoute.fullPath).toBe("/workspaces/$workspaceId/sessions/$sessionId");
    expect(workspaceAgentSessionsRoute.fullPath).toBe("/workspaces/$workspaceId/agents/$agentId/sessions");
    expect(workspaceAgentNewSessionRoute.fullPath).toBe("/workspaces/$workspaceId/agents/$agentId/sessions/new");
    expect(workspaceAgentSessionDetailRoute.fullPath).toBe(
      "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId"
    );
  });
});
