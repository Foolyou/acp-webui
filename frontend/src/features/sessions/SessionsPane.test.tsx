import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { AgentRuntimeStatus, SessionListItem, Workspace } from "../../types";

const mocks = vi.hoisted(() => ({
  buttons: [] as Array<{ className?: string; label: string; onPress?: () => void }>,
  button: vi.fn(({ children, className, onPress }: { children: ReactNode; className?: string; onPress?: () => void }) => {
    const label = Array.isArray(children) ? children.join(" ") : String(children);
    mocks.buttons.push({ className, label, onPress });
    return <button className={className}>{children}</button>;
  }),
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

vi.mock("react-aria-components", () => ({
  Button: mocks.button
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
    mocks.buttons = [];
    mocks.button.mockClear();
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

  test("scopes create choices to the selected agent and ignores a last profile for another agent", async () => {
    localStorage.setItem(
      "lastSessionProfile",
      JSON.stringify({
        version: 1,
        agentId: "agent-other",
        permissionMode: "full_auto",
        launchControlValues: { permission: "full_auto" }
      })
    );
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent(), agent({ id: "agent-other", title: "Other Agent" })]}
        loading={false}
        onCreate={vi.fn()}
        selectedAgentId="agent-default"
        sessions={[]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("Default Agent");
    expect(html).not.toContain("Other Agent");
    expect(html).not.toContain("Last profile");
  });

  test("creates with the selected agent when create controls are scoped", async () => {
    const onCreate = vi.fn();
    const { SessionsPane } = await import("./SessionsPane");

    renderToStaticMarkup(
      <SessionsPane
        agents={[agent(), agent({ id: "agent-other", title: "Other Agent" })]}
        loading={false}
        onCreate={onCreate}
        selectedAgentId="agent-default"
        sessions={[]}
        workspace={workspace()}
      />
    );

    const createButton = mocks.buttons.find((button) => button.label.includes("Create session"));
    expect(createButton).toBeDefined();

    createButton?.onPress?.();

    expect(onCreate).toHaveBeenCalledWith("agent-default", "manual", { permission: "manual" });
  });

  test("ignores stale non-launchable permission mode for the scoped agent", async () => {
    const { resolveActiveCreateModeId } = await import("./sessionCreateMode");
    const scopedAgent = agent({
      id: "agent-other",
      permissionModes: [
        {
          id: "yolo",
          label: "YOLO",
          description: "No approvals / no sandbox",
          riskLevel: "high",
          status: { state: "disabled", message: "Not allowed" }
        },
        {
          id: "manual",
          label: "Manual",
          description: "Ask before approval-managed actions",
          riskLevel: "low",
          status: { state: "idle" }
        }
      ]
    });

    expect(resolveActiveCreateModeId(scopedAgent, "yolo")).toBe("manual");
  });
});
