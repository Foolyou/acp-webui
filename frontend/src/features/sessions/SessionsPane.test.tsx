import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { AgentRuntimeStatus, SessionListItem, Workspace } from "../../types";

const mocks = vi.hoisted(() => ({
  buttons: [] as Array<{ className?: string; label: string; onPress?: () => void }>,
  links: [] as Array<{ params?: unknown; to?: string }>,
  button: vi.fn(({ children, className, onPress }: { children: ReactNode; className?: string; onPress?: () => void }) => {
    const label = Array.isArray(children) ? children.join(" ") : String(children);
    mocks.buttons.push({ className, label, onPress });
    return <button className={className}>{children}</button>;
  }),
  link: vi.fn(({ children, params, to }) => {
    mocks.links.push({ params, to });
    return <a>{children}</a>;
  })
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
    mocks.links = [];
    mocks.button.mockClear();
    mocks.link.mockClear();
  });

  test("shows an empty state scoped to the selected agent", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent({ id: "agent-codex", title: "Codex" })]}
        loading={false}
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

  test("links session cards to canonical workspace detail routes", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    renderToStaticMarkup(
      <SessionsPane
        agents={[agent({ id: "agent-codex", title: "Codex" })]}
        loading={false}
        selectedAgentId="agent-codex"
        sessions={[
          sessionItem({
            session: {
              ...sessionItem().session,
              id: "session-imported",
              agentId: "agent-codex",
              agentName: "Codex"
            },
            workspace: workspace({ id: "workspace-routed" })
          })
        ]}
        workspace={workspace({ id: "workspace-routed" })}
      />
    );

    expect(mocks.links).toContainEqual({
      to: "/workspaces/$workspaceId/sessions/$sessionId",
      params: {
        workspaceId: "workspace-routed",
        sessionId: "session-imported"
      }
    });
  });

  test("falls back to native session title when no local title exists", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent()]}
        loading={false}
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

  test("shows compact active-state badges for active sessions but not idle sessions", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent()]}
        loading={false}
        selectedAgentId="agent-default"
        sessions={[
          sessionItem({
            session: { ...sessionItem().session, id: "session-running", status: "running" },
            activeTurn: { startedAt: "2026-04-30T00:00:00Z", status: "running" }
          }),
          sessionItem({
            session: { ...sessionItem().session, id: "session-stopping", status: "stopping" },
            activeTurn: { startedAt: "2026-04-30T00:00:00Z", status: "stopping" }
          }),
          sessionItem({
            session: { ...sessionItem().session, id: "session-approval", status: "waiting_approval" },
            pendingPermission: {
              id: "permission-a",
              title: "Run command",
              kind: "tool",
              createdAt: "2026-04-30T00:00:00Z"
            }
          }),
          sessionItem({ session: { ...sessionItem().session, id: "session-idle", status: "idle" } })
        ]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("active-state-badge running");
    expect(html).toContain("Running");
    expect(html).toContain("active-state-badge stopping");
    expect(html).toContain("Stopping");
    expect(html).toContain("active-state-badge waiting-approval");
    expect(html).toContain("Waiting approval");
    expect(html).toContain("Approval: Run command");
    expect(html).toContain("Manual");
    expect(html).not.toContain("active-state-badge idle");
  });

  test("shows Claude YOLO warning in the session list from persisted permission mode", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent({ id: "claude", title: "Claude" })]}
        loading={false}
        selectedAgentId="claude"
        sessions={[
          sessionItem({
            session: {
              ...sessionItem().session,
              id: "session-claude-yolo",
              agentId: "claude",
              agentName: "Claude",
              permissionMode: "yolo"
            }
          })
        ]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("Claude");
    expect(html).toContain("permission-mode-badge permission-mode-yolo");
    expect(html).toContain("YOLO");
    expect(html).toContain("No approvals / no sandbox");
  });

  test("links new session to the workspace compose route", async () => {
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
        selectedAgentId="agent-default"
        sessions={[]}
        workspace={workspace()}
      />
    );

    expect(html).not.toContain("Last profile");
    expect(mocks.links).toContainEqual({
      to: "/workspaces/$workspaceId/sessions/new",
      params: { workspaceId: "workspace-a" }
    });
  });

  test("shows cockpit filters and compact session card fields", async () => {
    const { SessionsPane } = await import("./SessionsPane");

    const html = renderToStaticMarkup(
      <SessionsPane
        agents={[agent({ id: "agent-codex", title: "Codex" }), agent({ id: "agent-claude", title: "Claude" })]}
        loading={false}
        onSelectAgent={vi.fn()}
        selectedAgentId={null}
        sessions={[
          sessionItem({
            session: {
              ...sessionItem().session,
              id: "session-card",
              agentId: "agent-codex",
              agentName: "Codex",
              permissionMode: "full_auto",
              status: "waiting_approval",
              title: "Review plan"
            },
            pendingPermission: {
              id: "permission-a",
              title: "Run command",
              kind: "tool",
              createdAt: "2026-04-30T00:00:00Z"
            },
            queuedPromptCount: 2,
            hasReviewArtifacts: true,
            reviewArtifactCount: 1
          })
        ]}
        workspace={workspace()}
      />
    );

    expect(html).toContain("Status");
    expect(html).toContain("All agents");
    expect(html).toContain("Pending approval");
    expect(html).toContain("Review plan");
    expect(html).toContain("Codex");
    expect(html).toContain("Full auto");
    expect(html).toContain("2 queued");
    expect(html).toContain("1 review items");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Reject");
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
