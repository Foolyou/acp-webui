import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { AgentRuntimeStatus, SessionDetail } from "../../types";

const mocks = vi.hoisted(() => ({
  links: [] as Array<{ params?: unknown; to?: string }>,
  link: vi.fn(({ children, params, to }) => {
    mocks.links.push({ params, to });
    return <a>{children}</a>;
  }),
  button: vi.fn(({ children, className }: { children: ReactNode; className?: string }) => (
    <button className={className}>{children}</button>
  ))
}));

vi.mock("@tanstack/react-router", () => ({
  Link: mocks.link
}));

vi.mock("react-aria-components", () => ({
  Button: mocks.button
}));

function agentStatus(): AgentRuntimeStatus {
  return {
    id: "agent-codex",
    title: "Codex",
    enabled: true,
    status: { state: "ready" },
    permissionModes: [],
    launchControls: []
  };
}

function sessionDetail(): SessionDetail {
  return {
    session: {
      id: "session-routed",
      workspaceId: "workspace-routed",
      agentId: "agent-codex",
      agentName: "Codex",
      permissionMode: "manual",
      status: "idle",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z"
    },
    workspace: {
      id: "workspace-routed",
      name: "Workspace Routed",
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
    continuable: true
  };
}

describe("SessionPane route links", () => {
  test("returns to the canonical workspace cockpit route", async () => {
    const { SessionPane } = await import("./SessionPane");

    renderToStaticMarkup(
      <SessionPane
        agentStatus={agentStatus()}
        busy={false}
        currentSession={sessionDetail()}
        liveAssistant=""
        onOpenDiffFallback={vi.fn()}
        onOpenReviewArtifact={vi.fn()}
        onRestoreSession={vi.fn()}
        onResolvePermission={vi.fn()}
        onRunQueuedPrompts={vi.fn()}
        onSendPrompt={vi.fn()}
        onSetSessionConfigOption={vi.fn()}
        onStopSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onUpdateSessionTitle={vi.fn()}
        transcriptionAvailable={false}
      />
    );

    expect(mocks.links).toContainEqual({
      to: "/workspaces/$workspaceId/sessions",
      params: {
        workspaceId: "workspace-routed"
      }
    });
  });
});
