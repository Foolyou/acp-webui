import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentRuntimeStatus, SessionListItem, Workspace } from "../../types";

const mocks = vi.hoisted(() => ({
  link: vi.fn(({ children }) => <a>{children}</a>)
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
    title: "Default Agent",
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
    name: "Workspace Alpha",
    path: "<project-path>",
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
      agentName: "Default Agent",
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

describe("SessionsPane", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    mocks.link.mockClear();
  });

  test("shows an empty state scoped to the selected agent", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent({ id: "agent-codex", title: "Codex" })]}
        loading={false}
        onCreate={vi.fn()}
        onSelectAgent={vi.fn()}
        selectedAgentId="agent-codex"
        sessions={[]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("No sessions for Codex in this workspace.");
  });

  test("uses local session titles and shows differing native metadata", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent()]}
        loading={false}
        onCreate={vi.fn()}
        selectedAgentId="agent-default"
        sessions={[
          sessionItem({
            session: {
              ...sessionItem().session,
              title: "Local plan",
              nativeTitle: "Native plan",
              nativeUpdatedAt: "2026-04-30T00:00:00Z"
            }
          })
        ]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("Local plan");
    expect(html).toContain("Native: Native plan");
    expect(html).toContain("Native updated");
    expect(html).not.toContain("item-title\">Workspace Alpha");
  });

  test("falls back to native session title when no local title exists", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent()]}
        loading={false}
        onCreate={vi.fn()}
        selectedAgentId="agent-default"
        sessions={[
          sessionItem({
            session: {
              ...sessionItem().session,
              nativeTitle: "Imported session"
            }
          })
        ]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("Imported session");
    expect(html).not.toContain("Native: Imported session");
  });

  test("cleans row title fallback when agent name is whitespace", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent()]}
        loading={false}
        onCreate={vi.fn()}
        selectedAgentId="agent-default"
        sessions={[
          sessionItem({
            session: {
              ...sessionItem().session,
              id: "session-fallback",
              agentName: "   "
            }
          })
        ]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("session-fallback session");
    expect(html).not.toContain("> session<");
    expect(html).not.toContain("undefined session");
  });
});
