import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { AgentRuntimeStatus, SessionDetail } from "../../types";

const mocks = vi.hoisted(() => ({
  link: vi.fn(({ children }: { children: ReactNode }) => <a>{children}</a>),
  button: vi.fn(
    ({
      children,
      className,
      isDisabled,
      type
    }: {
      children: ReactNode;
      className?: string;
      isDisabled?: boolean;
      type?: "button" | "submit" | "reset";
    }) => (
      <button className={className} disabled={isDisabled} type={type}>
        {children}
      </button>
    )
  )
}));

vi.mock("@tanstack/react-router", () => ({
  Link: mocks.link
}));

vi.mock("react-aria-components", () => ({
  Button: mocks.button
}));

function agentStatus(): AgentRuntimeStatus {
  return {
    id: "codex",
    title: "Codex",
    enabled: true,
    status: {
      state: "ready",
      promptCapabilities: { image: true, audio: false, embeddedContext: true },
      sessionCapabilities: { loadSession: true, resumeSession: false, listSessions: true, closeSession: true }
    },
    permissionModes: [],
    launchControls: []
  };
}

function sessionDetail(): SessionDetail {
  return {
    session: {
      id: "session-approval",
      workspaceId: "workspace-test",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      status: "waiting_approval",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z"
    },
    workspace: {
      id: "workspace-test",
      name: "Workspace Test",
      path: "<project-path>",
      createdAt: "2026-04-30T00:00:00Z"
    },
    messages: [],
    queuedPrompts: [
      {
        id: "queued-1",
        sessionId: "session-approval",
        messageId: "message-1",
        prompt: "first queued prompt",
        contentBlocks: [{ type: "text", text: "first queued prompt" }],
        status: "queued",
        position: 1,
        createdAt: "2026-04-30T00:00:01Z"
      }
    ],
    activeTurn: { startedAt: "2026-04-30T00:00:00Z", status: "running" },
    reviewArtifacts: [],
    timeline: [],
    pendingPermission: {
      id: "permission-1",
      sessionId: "session-approval",
      acpSessionId: "acp-session",
      title: "Approve command",
      kind: "execute",
      status: "pending",
      toolCall: { content: [{ text: "npm test" }] },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "reject", name: "Reject", kind: "reject_once" }
      ],
      createdAt: "2026-04-30T00:00:02Z"
    },
    pendingPermissions: [],
    pendingApprovalCount: 3,
    queuedApprovalCount: 2,
    continuity: {
      state: "live",
      continuable: true,
      restorable: false,
      restoring: false
    },
    continuable: true
  };
}

describe("SessionPane inline approval", () => {
  test("renders the active approval and disables the composer while preserving queue order", async () => {
    const { SessionPane } = await import("./SessionPane");

    const html = renderToStaticMarkup(
      <SessionPane
        agentStatus={agentStatus()}
        busy={false}
        currentSession={sessionDetail()}
        liveAssistant=""
        onOpenDiffFallback={vi.fn()}
        onOpenReviewArtifact={vi.fn()}
        onRestoreSession={vi.fn()}
        onResolvePermission={vi.fn()}
        onSendPrompt={vi.fn()}
        onSetSessionConfigOption={vi.fn()}
        onStopSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onUpdateSessionTitle={vi.fn()}
        transcriptionAvailable={false}
      />
    );

    expect(html).toContain("inline-approval-panel");
    expect(html).toContain("Approve command");
    expect(html).toContain("Workspace Test");
    expect(html).toContain("npm test");
    expect(html).toContain("2 queued");
    expect(html).toContain("#1");
    expect(html).toContain("first queued prompt");
    expect(html).toContain("Waiting for approval");
    expect(html).toContain("disabled");
  });
});
