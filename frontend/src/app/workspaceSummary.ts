import type { InboxItem, SessionListItem, Workspace } from "../types";

export type WorkspaceSummary = {
  pendingApprovals: number;
  running: number;
  failed: number;
  recentActivityAt: string | null;
};

export function summarizeWorkspace(workspace: Workspace, sessions: SessionListItem[], inbox: InboxItem[]): WorkspaceSummary {
  const workspaceSessions = sessions.filter((item) => item.workspace.id === workspace.id);
  return {
    pendingApprovals: countPendingApprovals(workspace.id, workspaceSessions, inbox),
    running: workspaceSessions.filter(isRunningSession).length,
    failed: workspaceSessions.filter((item) => item.session.status === "failed").length,
    recentActivityAt: latestActivity(workspaceSessions)
  };
}

function countPendingApprovals(workspaceId: string, sessions: SessionListItem[], inbox: InboxItem[]) {
  const pendingSessionIds = new Set<string>();
  for (const item of sessions) {
    if (item.pendingPermission || item.session.status === "waiting_approval") {
      pendingSessionIds.add(item.session.id);
    }
  }
  for (const item of inbox) {
    if (item.workspace.id === workspaceId) {
      pendingSessionIds.add(item.session.id);
    }
  }
  return pendingSessionIds.size;
}

function isRunningSession(item: SessionListItem) {
  return item.session.status === "running" || item.activeTurn?.status === "running";
}

function latestActivity(sessions: SessionListItem[]) {
  return sessions
    .map((item) => item.lastActivityAt)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}
