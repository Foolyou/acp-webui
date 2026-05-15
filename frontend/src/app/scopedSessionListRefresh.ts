import type { RealtimeEvent } from "../types";

export type WorkspaceAgentScope = {
  currentWorkspaceId: string | null;
  currentAgentId: string | null;
};

export function shouldRefreshScopedSessionList(event: RealtimeEvent, scope: WorkspaceAgentScope): boolean {
  return (
    event.type === "session_list_changed" &&
    event.workspaceId === scope.currentWorkspaceId &&
    event.agentId === scope.currentAgentId
  );
}
