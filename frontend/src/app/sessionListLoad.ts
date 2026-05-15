import type { UiState } from "./types";

export type SessionListLoadScope = {
  workspaceId?: string | null;
  agentId?: string | null;
};

export type SessionListLoadToken = SessionListLoadScope & {
  generation: number;
};

export function canApplySessionListLoad(
  token: SessionListLoadToken,
  latestGeneration: number,
  current: Pick<UiState, "currentWorkspaceId" | "currentAgentId">
) {
  if (token.generation !== latestGeneration) {
    return false;
  }
  if (token.workspaceId && current.currentWorkspaceId !== token.workspaceId) {
    return false;
  }
  if (token.workspaceId && token.agentId && current.currentAgentId !== token.agentId) {
    return false;
  }
  return true;
}
