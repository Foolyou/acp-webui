import type {
  RealtimeEvent,
  SessionDetail,
  SessionListItem,
  SessionListPermission
} from "../types";

export function sessionDetailToListItem(detail: SessionDetail): SessionListItem {
  return {
    session: detail.session,
    workspace: detail.workspace,
    lastActivityAt: detail.session.updatedAt,
    pendingPermission: detail.pendingPermission
      ? {
          id: detail.pendingPermission.id,
          title: detail.pendingPermission.title,
          kind: detail.pendingPermission.kind,
          createdAt: detail.pendingPermission.createdAt
        }
      : null,
    queuedApprovalCount: detail.queuedApprovalCount ?? 0,
    reviewArtifactCount: detail.reviewArtifacts.length,
    hasReviewArtifacts: detail.reviewArtifacts.length > 0,
    continuable: detail.continuable,
    viewOnlyReason: detail.viewOnlyReason ?? null
  };
}

export function applySessionListRealtime(
  sessions: SessionListItem[],
  event: RealtimeEvent,
  currentSession: SessionDetail | null
): SessionListItem[] {
  switch (event.type) {
    case "session_status":
      return updateSessionListStatus(sessions, event.sessionId, event.status);
    case "permission_requested":
      return setSessionListPermission(
        sessions,
        event.permission.sessionId,
        {
          id: (event.activePermission ?? event.permission).id,
          title: (event.activePermission ?? event.permission).title,
          kind: (event.activePermission ?? event.permission).kind,
          createdAt: (event.activePermission ?? event.permission).createdAt
        },
        event.queuedApprovalCount ?? Math.max((event.pendingApprovalCount ?? 1) - 1, 0),
        currentSession
      );
    case "permission_resolved":
      return event.nextPermission
        ? setSessionListPermission(
            sessions,
            event.sessionId,
            {
              id: event.nextPermission.id,
              title: event.nextPermission.title,
              kind: event.nextPermission.kind,
              createdAt: event.nextPermission.createdAt
            },
            event.queuedApprovalCount ?? 0,
            currentSession
          )
        : clearSessionListPermission(sessions, event.sessionId);
    case "review_artifact":
      return updateSessionListReviewAvailability(sessions, event.artifact.sessionId);
    default:
      return sessions;
  }
}

export function updateSessionListStatus(sessions: SessionListItem[], sessionId: string, status: string) {
  const now = new Date().toISOString();
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          lastActivityAt: now,
          session: {
            ...item.session,
            status: normalizeSessionListStatus(status, Boolean(item.pendingPermission)),
            updatedAt: now
          }
        }
      : item
  );
}

export function clearSessionListPermission(sessions: SessionListItem[], sessionId: string) {
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          pendingPermission: null,
          queuedApprovalCount: 0
        }
      : item
  );
}

export function setSessionListPermission(
  sessions: SessionListItem[],
  sessionId: string,
  pendingPermission: SessionListPermission,
  queuedApprovalCount: number,
  currentSession: SessionDetail | null
) {
  const existing = sessions.some((item) => item.session.id === sessionId);
  const updated = sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          pendingPermission,
          queuedApprovalCount,
          session: { ...item.session, status: "waiting_approval" }
        }
      : item
  );

  if (existing || currentSession?.session.id !== sessionId) {
    return updated;
  }

  return [
    {
      ...sessionDetailToListItem(currentSession),
      pendingPermission,
      queuedApprovalCount,
      session: { ...currentSession.session, status: "waiting_approval" }
    },
    ...updated
  ];
}

function updateSessionListReviewAvailability(sessions: SessionListItem[], sessionId: string) {
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          reviewArtifactCount: item.reviewArtifactCount + 1,
          hasReviewArtifacts: true
        }
      : item
  );
}

function normalizeSessionListStatus(status: string, hasPendingPermission: boolean) {
  if (hasPendingPermission && status === "idle") {
    return "waiting_approval";
  }
  return status;
}
