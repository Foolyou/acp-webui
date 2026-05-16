import { describe, expect, test } from "vitest";
import type { InboxItem, SessionListItem, Workspace } from "../types";
import { summarizeWorkspace } from "./workspaceSummary";

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-a",
    name: "Workspace",
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
      agentId: "codex",
      agentName: "Codex",
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

function inboxItem(session: SessionListItem): InboxItem {
  return {
    session: session.session,
    workspace: session.workspace,
    permission: {
      id: "permission-a",
      sessionId: session.session.id,
      acpSessionId: "acp-session",
      title: "Run command",
      kind: "tool",
      status: "pending",
      toolCall: {},
      options: [],
      createdAt: "2026-04-30T00:00:00Z"
    }
  };
}

describe("summarizeWorkspace", () => {
  test("summarizes pending approvals, running, failed, and recent activity", () => {
    const target = workspace();
    const approval = sessionItem({
      session: { ...sessionItem().session, id: "approval", status: "waiting_approval" },
      lastActivityAt: "2026-05-01T00:00:00Z"
    });
    const summary = summarizeWorkspace(
      target,
      [
        approval,
        sessionItem({ session: { ...sessionItem().session, id: "running", status: "running" } }),
        sessionItem({ session: { ...sessionItem().session, id: "failed", status: "failed" } }),
        sessionItem({
          workspace: workspace({ id: "workspace-other" }),
          session: { ...sessionItem().session, id: "other", workspaceId: "workspace-other", status: "running" }
        })
      ],
      [inboxItem(approval)]
    );

    expect(summary).toEqual({
      pendingApprovals: 1,
      running: 1,
      failed: 1,
      recentActivityAt: "2026-05-01T00:00:00Z"
    });
  });
});
