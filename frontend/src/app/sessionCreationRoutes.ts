import type { SessionDetail } from "../types";

export function createSessionCreatingRouteTarget(workspaceId: string, agentId?: string) {
  if (agentId) {
    return {
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/new" as const,
      params: { workspaceId, agentId }
    };
  }

  return {
    to: "/workspaces/$workspaceId/sessions/new" as const,
    params: { workspaceId }
  };
}

export function createSessionRouteTargets(workspaceId: string, agentId: string | undefined, detail: SessionDetail) {
  return {
    creating: createSessionCreatingRouteTarget(workspaceId, agentId),
    detail: createSessionDetailRouteTarget(agentId, detail)
  };
}

export function createSessionDetailRouteTarget(agentId: string | undefined, detail: SessionDetail) {
  if (agentId) {
    return {
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId" as const,
      params: {
        workspaceId: detail.workspace.id,
        agentId: detail.session.agentId,
        sessionId: detail.session.id
      },
      replace: true
    };
  }

  return {
    to: "/workspaces/$workspaceId/sessions/$sessionId" as const,
    params: { workspaceId: detail.workspace.id, sessionId: detail.session.id },
    replace: true
  };
}

export function createRestoredSessionDetailRouteTarget(detail: SessionDetail) {
  return {
    to: "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId" as const,
    params: {
      workspaceId: detail.workspace.id,
      agentId: detail.session.agentId,
      sessionId: detail.session.id
    },
    replace: true
  };
}
