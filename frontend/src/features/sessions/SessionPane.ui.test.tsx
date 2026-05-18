import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { AgentRuntimeStatus, SessionDetail } from "../../types";

const mocks = vi.hoisted(() => ({
  buttons: [] as Array<{
    ariaLabel?: string;
    className?: string;
    label: string;
    onPress?: () => void;
    tooltip?: string;
    type?: "button" | "submit" | "reset";
  }>,
  link: vi.fn(({ children }: { children: ReactNode }) => <a>{children}</a>),
  button: vi.fn(
    ({
      "aria-label": ariaLabel,
      children,
      className,
      "data-tooltip": tooltip,
      isDisabled,
      onPress,
      type
    }: {
      "aria-label"?: string;
      children: ReactNode;
      className?: string;
      "data-tooltip"?: string;
      isDisabled?: boolean;
      onPress?: () => void;
      type?: "button" | "submit" | "reset";
    }) => {
      const label = textFromNode(children);
      mocks.buttons.push({ ariaLabel, className, label, onPress, tooltip, type });
      return (
        <button aria-label={ariaLabel} className={className} data-tooltip={tooltip} disabled={isDisabled} type={type}>
          {children}
        </button>
      );
    }
  )
}));

vi.mock("@tanstack/react-router", () => ({
  Link: mocks.link
}));

vi.mock("react-aria-components", () => ({
  Button: mocks.button
}));

function textFromNode(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (typeof node === "object" && "props" in node) {
    return textFromNode((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

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
    mocks.buttons = [];
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
        onRunQueuedPrompts={vi.fn()}
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

  test("offers queue running when queued prompts have no active turn", async () => {
    mocks.buttons = [];
    const { SessionPane } = await import("./SessionPane");
    const detail = sessionDetail();
    detail.session.status = "idle";
    detail.activeTurn = null;
    detail.pendingPermission = null;
    detail.pendingApprovalCount = 0;
    detail.queuedApprovalCount = 0;
    detail.queuedPrompts = [
      ...(detail.queuedPrompts ?? []),
      {
        id: "queued-2",
        sessionId: "session-approval",
        messageId: "message-2",
        prompt: "second queued prompt",
        contentBlocks: [{ type: "text", text: "second queued prompt" }],
        status: "queued",
        position: 2,
        createdAt: "2026-04-30T00:00:03Z"
      }
    ];

    const onRunQueuedPrompts = vi.fn();
    const html = renderToStaticMarkup(
      <SessionPane
        agentStatus={agentStatus()}
        busy={false}
        currentSession={detail}
        liveAssistant=""
        onOpenDiffFallback={vi.fn()}
        onOpenReviewArtifact={vi.fn()}
        onRestoreSession={vi.fn()}
        onResolvePermission={vi.fn()}
        onRunQueuedPrompts={onRunQueuedPrompts}
        onSendPrompt={vi.fn()}
        onSetSessionConfigOption={vi.fn()}
        onStopSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onUpdateSessionTitle={vi.fn()}
        transcriptionAvailable={false}
      />
    );

    expect(html).toContain("2 queued");
    expect(html).toContain("Run queued prompts");
    expect(html).not.toContain(">Stop</button>");
    const runQueue = mocks.buttons.find((button) => button.ariaLabel === "Run queued prompts");
    expect(runQueue?.className).toContain("composer-icon-button");
    expect(runQueue?.tooltip).toBe("Run queued prompts");
    expect(runQueue?.type).toBe("button");
    runQueue?.onPress?.();
    expect(onRunQueuedPrompts).toHaveBeenCalledTimes(1);
  });

  test("renders common composer actions as labelled icon controls while keeping state text readable", async () => {
    mocks.buttons = [];
    const { SessionPane } = await import("./SessionPane");
    const detail = sessionDetail();
    detail.session.status = "idle";
    detail.activeTurn = null;
    detail.pendingPermission = null;
    detail.pendingApprovalCount = 0;
    detail.queuedApprovalCount = 0;
    detail.queuedPrompts = [];

    const html = renderToStaticMarkup(
      <SessionPane
        agentStatus={agentStatus()}
        busy={false}
        currentSession={detail}
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

    for (const name of ["Open prompt templates", "Attach image", "Send prompt"]) {
      const action = mocks.buttons.find((button) => button.ariaLabel === name);
      expect(action?.className).toContain("composer-icon-button");
      expect(action?.tooltip).toBe(name);
    }
    expect(html).toContain('class="composer-action-icon composer-action-svg send"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain("Ask Codex");
    expect(html).not.toContain(">Prompts</button>");
    expect(html).not.toContain(">Image</button>");
    expect(html).not.toContain(">Send</button>");
  });

  test("shows Claude YOLO warning from persisted local permission mode", async () => {
    mocks.buttons = [];
    const { SessionPane } = await import("./SessionPane");
    const detail = sessionDetail();
    detail.session = {
      ...detail.session,
      id: "session-claude-yolo",
      agentId: "claude",
      agentName: "Claude",
      permissionMode: "yolo",
      status: "idle"
    };
    detail.activeTurn = null;
    detail.pendingPermission = null;
    detail.pendingApprovalCount = 0;
    detail.queuedApprovalCount = 0;
    detail.queuedPrompts = [];
    detail.configOptions = [
      {
        id: "mode",
        name: "Mode",
        type: "select",
        currentValue: "default",
        options: [
          { value: "default", name: "Default" },
          { value: "bypassPermissions", name: "Bypass permissions" }
        ]
      }
    ];

    const html = renderToStaticMarkup(
      <SessionPane
        agentStatus={{
          ...agentStatus(),
          id: "claude",
          title: "Claude",
          permissionModes: [
            {
              id: "manual",
              label: "Manual",
              description: "Ask before approval-managed actions",
              riskLevel: "low",
              status: { state: "ready" }
            },
            {
              id: "yolo",
              label: "YOLO",
              description: "No approvals / no sandbox",
              riskLevel: "high",
              status: { state: "ready" }
            }
          ]
        }}
        busy={false}
        currentSession={detail}
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

    expect(html).toContain("YOLO mode: approvals and sandboxing are bypassed.");
    expect(html).toContain("permission-mode-badge permission-mode-yolo");
    expect(html).toContain(">YOLO</span>");
  });
});
