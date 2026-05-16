import type { UiState } from "./types";

export type ProjectionRecoveryToken = {
  generation: number;
  workspaceId: string | null;
  agentId: string | null;
  sessionId: string | null;
};

export function canApplyProjectionRecovery(token: ProjectionRecoveryToken, currentGeneration: number) {
  return token.generation === currentGeneration;
}

export function canApplyRecoveredSessionList(
  token: ProjectionRecoveryToken,
  currentGeneration: number,
  current: Pick<UiState, "currentWorkspaceId" | "currentAgentId">
) {
  return (
    canApplyProjectionRecovery(token, currentGeneration) &&
    current.currentWorkspaceId === token.workspaceId &&
    current.currentAgentId === token.agentId
  );
}

export function canApplyRecoveredSessionDetail(
  token: ProjectionRecoveryToken,
  currentGeneration: number,
  current: Pick<UiState, "currentSession">
) {
  return (
    canApplyProjectionRecovery(token, currentGeneration) &&
    token.sessionId !== null &&
    current.currentSession?.session.id === token.sessionId
  );
}
