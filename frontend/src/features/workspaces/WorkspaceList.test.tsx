import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentRuntimeStatus, Workspace } from "../../types";

const mocks = vi.hoisted(() => ({
  link: vi.fn()
}));

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

vi.mock("@tanstack/react-router", () => ({
  Link: mocks.link
}));

function agent(overrides: Partial<AgentRuntimeStatus> = {}): AgentRuntimeStatus {
  return {
    id: "agent-default",
    title: "Agent",
    enabled: true,
    status: { state: "idle" },
    permissionModes: [],
    launchControls: [],
    ...overrides
  };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-a",
    name: "Workspace",
    path: "workspace",
    createdAt: "2026-04-30T00:00:00Z",
    ...overrides
  };
}

describe("WorkspaceList", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    mocks.link.mockReset();
    mocks.link.mockReturnValue(null);
  });

  test("links workspaces to remembered workspace-agent session routes", async () => {
    localStorage.setItem(
      "workspaceAgentNavigation",
      JSON.stringify({
        version: 1,
        currentAgentIdByWorkspace: { "workspace-a": "agent-remembered" }
      })
    );
    const { WorkspaceList } = await import("./WorkspaceList");

    renderToStaticMarkup(
      <WorkspaceList agents={[agent(), agent({ id: "agent-remembered" })]} workspaces={[workspace()]} />
    );

    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/workspaces/$workspaceId/agents/$agentId/sessions",
        params: { workspaceId: "workspace-a", agentId: "agent-remembered" }
      }),
      undefined
    );
  });

  test("keeps workspace links on the safe legacy route when no agent resolves", async () => {
    const { WorkspaceList } = await import("./WorkspaceList");

    renderToStaticMarkup(<WorkspaceList agents={[agent({ status: { state: "disabled" } })]} workspaces={[workspace()]} />);

    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: "workspace-a" }
      }),
      undefined
    );
  });
});
