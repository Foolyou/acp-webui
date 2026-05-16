import type { AgentRuntimeStatus } from "../types";

const storageKey = "workspaceAgentNavigation";

export type WorkspaceAgentNavigationState = {
  version: 1;
  currentAgentIdByWorkspace: Record<string, string>;
};

function emptyState(): WorkspaceAgentNavigationState {
  return {
    version: 1,
    currentAgentIdByWorkspace: {}
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkspaceMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [workspaceId, agentId] of Object.entries(value)) {
    if (workspaceId && typeof agentId === "string" && agentId) {
      next[workspaceId] = agentId;
    }
  }
  return next;
}

export function readWorkspaceAgentNavigation(storage: Storage = localStorage): WorkspaceAgentNavigationState {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return emptyState();
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || value.version !== 1) {
      return emptyState();
    }
    return {
      version: 1,
      currentAgentIdByWorkspace: normalizeWorkspaceMap(value.currentAgentIdByWorkspace)
    };
  } catch {
    return emptyState();
  }
}

export function writeWorkspaceAgentNavigation(
  state: WorkspaceAgentNavigationState,
  storage: Storage = localStorage
) {
  storage.setItem(
    storageKey,
    JSON.stringify({
      version: 1,
      currentAgentIdByWorkspace: normalizeWorkspaceMap(state.currentAgentIdByWorkspace)
    })
  );
}

export function readRememberedWorkspaceAgentId(workspaceId: string, storage: Storage = localStorage): string | null {
  return readWorkspaceAgentNavigation(storage).currentAgentIdByWorkspace[workspaceId] ?? null;
}

export function rememberWorkspaceAgent(
  workspaceId: string,
  agentId: string,
  storage: Storage = localStorage
): WorkspaceAgentNavigationState {
  const state = readWorkspaceAgentNavigation(storage);
  const next = {
    version: 1 as const,
    currentAgentIdByWorkspace: {
      ...state.currentAgentIdByWorkspace,
      [workspaceId]: agentId
    }
  };
  writeWorkspaceAgentNavigation(next, storage);
  return next;
}

export function forgetWorkspaceAgent(workspaceId: string, storage: Storage = localStorage): WorkspaceAgentNavigationState {
  const state = readWorkspaceAgentNavigation(storage);
  const currentAgentIdByWorkspace = { ...state.currentAgentIdByWorkspace };
  delete currentAgentIdByWorkspace[workspaceId];
  const next = {
    version: 1 as const,
    currentAgentIdByWorkspace
  };
  writeWorkspaceAgentNavigation(next, storage);
  return next;
}

export function isAvailableWorkspaceAgent(agent: AgentRuntimeStatus): boolean {
  return agent.enabled && agent.status.state !== "disabled";
}

export function resolveWorkspaceAgentId(
  workspaceId: string | null,
  agents: AgentRuntimeStatus[],
  storage: Storage = localStorage
): string | null {
  if (!workspaceId) return null;
  const rememberedAgentId = readRememberedWorkspaceAgentId(workspaceId, storage);
  if (rememberedAgentId) {
    const rememberedAgent = agents.find((agent) => agent.id === rememberedAgentId);
    if (rememberedAgent && isAvailableWorkspaceAgent(rememberedAgent)) {
      return rememberedAgent.id;
    }
  }
  return agents.find(isAvailableWorkspaceAgent)?.id ?? null;
}

export function workspaceSessionsRouteTarget(
  workspaceId: string,
  _agents: AgentRuntimeStatus[] = [],
  _storage: Storage = localStorage
): {
  to: "/workspaces/$workspaceId/sessions";
  params: { workspaceId: string };
} {
  return {
    to: "/workspaces/$workspaceId/sessions",
    params: { workspaceId }
  };
}
