import { describe, expect, test } from "vitest";
import type { SessionListItem } from "../types";
import { filterCockpitSessions, pendingApprovalSessionCount } from "./sessionCockpit";

function sessionItem(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    session: {
      id: "session-a",
      workspaceId: "workspace-a",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      status: "idle",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z"
    },
    workspace: {
      id: "workspace-a",
      name: "Workspace",
      path: "<project-path>",
      createdAt: "2026-04-30T00:00:00Z"
    },
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

describe("filterCockpitSessions", () => {
  test("defaults to latest activity descending across all agents", () => {
    const sessions = [
      sessionItem({ session: { ...sessionItem().session, id: "older" }, lastActivityAt: "2026-04-30T00:00:00Z" }),
      sessionItem({ session: { ...sessionItem().session, id: "newer", agentId: "claude" }, lastActivityAt: "2026-05-01T00:00:00Z" })
    ];

    expect(filterCockpitSessions(sessions, "all", null).map((item) => item.session.id)).toEqual(["newer", "older"]);
  });

  test("composes pending approval status and agent filters", () => {
    const sessions = [
      sessionItem({
        session: { ...sessionItem().session, id: "codex-approval", agentId: "codex", status: "waiting_approval" },
        pendingPermission: {
          id: "permission-a",
          title: "Run command",
          kind: "tool",
          createdAt: "2026-04-30T00:00:00Z"
        }
      }),
      sessionItem({
        session: { ...sessionItem().session, id: "claude-approval", agentId: "claude", status: "waiting_approval" },
        pendingPermission: {
          id: "permission-b",
          title: "Edit file",
          kind: "tool",
          createdAt: "2026-04-30T00:00:00Z"
        }
      }),
      sessionItem({ session: { ...sessionItem().session, id: "codex-running", agentId: "codex", status: "running" } })
    ];

    expect(filterCockpitSessions(sessions, "pending_approval", "codex").map((item) => item.session.id)).toEqual([
      "codex-approval"
    ]);
    expect(pendingApprovalSessionCount(sessions)).toBe(2);
  });

  test("matches failed and view only restore states", () => {
    const sessions = [
      sessionItem({ session: { ...sessionItem().session, id: "failed", status: "failed" } }),
      sessionItem({
        session: { ...sessionItem().session, id: "restore-needed" },
        continuable: false,
        continuity: {
          state: "view_only",
          continuable: false,
          restorable: true,
          restoring: false
        }
      })
    ];

    expect(filterCockpitSessions(sessions, "failed", null).map((item) => item.session.id)).toEqual(["failed"]);
    expect(filterCockpitSessions(sessions, "view_only_restore", null).map((item) => item.session.id)).toEqual([
      "restore-needed"
    ]);
  });
});
