import { describe, expect, test, vi } from "vitest";

describe("workspace agent session routes", () => {
  test("defines canonical workspace-agent session paths", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    });
    const { workspaceAgentSessionsRoute, workspaceAgentNewSessionRoute, workspaceAgentSessionDetailRoute } =
      await import("./router");

    expect(workspaceAgentSessionsRoute.fullPath).toBe("/workspaces/$workspaceId/agents/$agentId/sessions");
    expect(workspaceAgentNewSessionRoute.fullPath).toBe("/workspaces/$workspaceId/agents/$agentId/sessions/new");
    expect(workspaceAgentSessionDetailRoute.fullPath).toBe(
      "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId"
    );
  });
});
