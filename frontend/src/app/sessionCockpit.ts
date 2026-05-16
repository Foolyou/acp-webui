import type { SessionListItem } from "../types";

export type SessionStatusFilter = "all" | "pending_approval" | "running" | "failed" | "view_only_restore";

export const sessionStatusFilterOptions: Array<{ id: SessionStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending_approval", label: "Pending approval" },
  { id: "running", label: "Running" },
  { id: "failed", label: "Failed" },
  { id: "view_only_restore", label: "View only / restore needed" }
];

export function sortSessionsByLatestActivity(sessions: SessionListItem[]): SessionListItem[] {
  return [...sessions].sort((left, right) => {
    const byActivity = Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
    return byActivity || left.session.id.localeCompare(right.session.id);
  });
}

export function pendingApprovalSessionCount(sessions: SessionListItem[]) {
  return sessions.filter((item) => sessionMatchesStatus(item, "pending_approval")).length;
}

export function filterCockpitSessions(
  sessions: SessionListItem[],
  statusFilter: SessionStatusFilter,
  agentFilter: string | null
): SessionListItem[] {
  return sortSessionsByLatestActivity(
    sessions.filter((item) => sessionMatchesStatus(item, statusFilter) && sessionMatchesAgent(item, agentFilter))
  );
}

export function sessionMatchesStatus(item: SessionListItem, statusFilter: SessionStatusFilter) {
  switch (statusFilter) {
    case "all":
      return true;
    case "pending_approval":
      return Boolean(item.pendingPermission) || item.session.status === "waiting_approval";
    case "running":
      return item.session.status === "running" || item.activeTurn?.status === "running";
    case "failed":
      return item.session.status === "failed";
    case "view_only_restore":
      return isViewOnlyOrRestoreNeeded(item);
    default:
      return true;
  }
}

function sessionMatchesAgent(item: SessionListItem, agentFilter: string | null) {
  return !agentFilter || item.session.agentId === agentFilter;
}

function isViewOnlyOrRestoreNeeded(item: SessionListItem) {
  if (!item.continuable) return true;
  return ["loadable", "resumable", "restore_failed", "view_only"].includes(item.continuity.state);
}
