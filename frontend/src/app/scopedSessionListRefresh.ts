import type { RealtimeEvent } from "../types";

export type WorkspaceAgentScope = {
  currentWorkspaceId: string | null;
  currentAgentId: string | null;
};

export type ScopedSessionListRefreshState = {
  scope: WorkspaceAgentScope;
  scopeVersion: number;
  requestGeneration: number;
};

export type ScopedSessionListRefreshToken = {
  workspaceId: string;
  agentId: string;
  scopeVersion: number;
  requestGeneration: number;
};

export function shouldRefreshScopedSessionList(event: RealtimeEvent, scope: WorkspaceAgentScope): boolean {
  return (
    event.type === "session_list_changed" &&
    event.workspaceId === scope.currentWorkspaceId &&
    event.agentId === scope.currentAgentId
  );
}

export function createScopedSessionListRefreshState(scope: WorkspaceAgentScope): ScopedSessionListRefreshState {
  return {
    scope,
    scopeVersion: 0,
    requestGeneration: 0
  };
}

export function syncScopedSessionListRefreshScope(
  state: ScopedSessionListRefreshState,
  scope: WorkspaceAgentScope
): ScopedSessionListRefreshState {
  if (sameScope(state.scope, scope)) {
    return state;
  }
  return {
    ...state,
    scope,
    scopeVersion: state.scopeVersion + 1
  };
}

export function beginScopedSessionListRefresh(
  state: ScopedSessionListRefreshState,
  event: Extract<RealtimeEvent, { type: "session_list_changed" }>
): { state: ScopedSessionListRefreshState; token: ScopedSessionListRefreshToken | null } {
  if (!shouldRefreshScopedSessionList(event, state.scope)) {
    return { state, token: null };
  }
  const nextState = {
    ...state,
    requestGeneration: state.requestGeneration + 1
  };
  return {
    state: nextState,
    token: {
      workspaceId: event.workspaceId,
      agentId: event.agentId,
      scopeVersion: nextState.scopeVersion,
      requestGeneration: nextState.requestGeneration
    }
  };
}

export function canApplyScopedSessionListRefresh(
  token: ScopedSessionListRefreshToken,
  state: ScopedSessionListRefreshState,
  scope: WorkspaceAgentScope
): boolean {
  return (
    token.workspaceId === scope.currentWorkspaceId &&
    token.agentId === scope.currentAgentId &&
    token.scopeVersion === state.scopeVersion &&
    token.requestGeneration === state.requestGeneration &&
    sameScope(state.scope, scope)
  );
}

function sameScope(left: WorkspaceAgentScope, right: WorkspaceAgentScope): boolean {
  return left.currentWorkspaceId === right.currentWorkspaceId && left.currentAgentId === right.currentAgentId;
}
