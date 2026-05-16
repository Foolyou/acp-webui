import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentRuntimeStatus, InboxItem, SessionListItem, Workspace } from "../../types";

const mocks = vi.hoisted(() => ({
  link: vi.fn(({ children, className }: { children: string; className?: string }) => (
    <a className={className}>{children}</a>
  ))
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

vi.mock("react-aria-components", () => ({
  Button: ({ children, className }: { children: string; className?: string }) => (
    <button className={className}>{children}</button>
  )
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

function sessionItem(overrides: Partial<SessionListItem> = {}): SessionListItem {
  const baseWorkspace = workspace();
  return {
    session: {
      id: "session-a",
      workspaceId: baseWorkspace.id,
      agentId: "agent-default",
      agentName: "Agent",
      permissionMode: "manual",
      status: "idle",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z"
    },
    workspace: baseWorkspace,
    lastActivityAt: "2026-04-30T00:00:00Z",
    reviewArtifactCount: 0,
    hasReviewArtifacts: false,
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

function inboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  const item = sessionItem({
    session: { ...sessionItem().session, id: "session-approval", status: "waiting_approval" }
  });
  return {
    session: item.session,
    workspace: item.workspace,
    permission: {
      id: "permission-a",
      sessionId: item.session.id,
      acpSessionId: "acp-session",
      title: "Run command",
      kind: "tool",
      status: "pending",
      toolCall: {},
      options: [],
      createdAt: "2026-04-30T00:00:00Z"
    },
    ...overrides
  };
}

const listActions = {
  busy: false,
  onDeleteWorkspace: vi.fn(),
  onUpdateWorkspace: vi.fn()
};

describe("WorkspaceList", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    mocks.link.mockReset();
  });

  test("links workspaces to canonical cockpit routes", async () => {
    localStorage.setItem(
      "workspaceAgentNavigation",
      JSON.stringify({
        version: 1,
        currentAgentIdByWorkspace: { "workspace-a": "agent-remembered" }
      })
    );
    const { WorkspaceList } = await import("./WorkspaceList");

    renderToStaticMarkup(
      <WorkspaceList agents={[agent(), agent({ id: "agent-remembered" })]} workspaces={[workspace()]} {...listActions} />
    );

    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: "workspace-a" }
      }),
      undefined
    );
  });

  test("keeps workspace links on the canonical route when no agent resolves", async () => {
    const { WorkspaceList } = await import("./WorkspaceList");

    renderToStaticMarkup(
      <WorkspaceList agents={[agent({ status: { state: "disabled" } })]} workspaces={[workspace()]} {...listActions} />
    );

    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: "workspace-a" }
      }),
      undefined
    );
  });

  test("renders workspace management actions", async () => {
    const { WorkspaceList } = await import("./WorkspaceList");

    const html = renderToStaticMarkup(
      <WorkspaceList agents={[agent()]} workspaces={[workspace()]} {...listActions} />
    );

    expect(html).toContain("Edit");
    expect(html).toContain("Delete");
  });

  test("summarizes workspace attention and recent activity", async () => {
    const { WorkspaceList } = await import("./WorkspaceList");

    const html = renderToStaticMarkup(
      <WorkspaceList
        agents={[agent()]}
        inbox={[inboxItem()]}
        sessions={[
          sessionItem({ session: { ...sessionItem().session, id: "session-running", status: "running" } }),
          sessionItem({ session: { ...sessionItem().session, id: "session-failed", status: "failed" } })
        ]}
        workspaces={[workspace()]}
        {...listActions}
      />
    );

    expect(html).toContain("1 pending approvals");
    expect(html).toContain("1 running");
    expect(html).toContain("1 failed");
    expect(html).toContain("Recent");
    expect(html).toContain("primary small workspace-open-link");
  });
});
