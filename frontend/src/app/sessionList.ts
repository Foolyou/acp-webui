import type {
  RealtimeEvent,
  SessionContinuity,
  SessionDetail,
  SessionListItem,
  SessionListPermission
} from "../types";

export function sessionDetailToListItem(detail: SessionDetail): SessionListItem {
  return {
    session: detail.session,
    workspace: detail.workspace,
    lastActivityAt: sessionDetailActivityAt(detail),
    currentModel: detail.currentModel ?? null,
    launchControlSummary: detail.launchControlSummary ?? [],
    queuedPromptCount: detail.queuedPrompts?.length ?? 0,
    activeTurn: detail.activeTurn ?? null,
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
    continuity: detail.continuity,
    continuable: detail.continuable,
    viewOnlyReason: detail.viewOnlyReason ?? null
  };
}

function sessionDetailActivityAt(detail: SessionDetail) {
  const activityCandidates = [
    detail.session.nativeUpdatedAt,
    detail.activeTurn?.startedAt,
    ...detail.timeline.map((item) => item.timestamp),
    ...detail.reviewArtifacts.map((artifact) => artifact.createdAt),
    ...(detail.pendingPermissions ?? []).map((permission) => permission.resolvedAt ?? permission.createdAt),
    ...(detail.queuedPrompts ?? []).map((prompt) => prompt.submittedAt ?? prompt.createdAt)
  ];
  const candidates = [...activityCandidates];
  if (
    !activityCandidates.some((value) => value?.trim()) ||
    !detail.session.externalSessionId ||
    !detail.session.nativeUpdatedAt
  ) {
    candidates.push(detail.session.createdAt);
  }
  return (
    latestTimestamp(candidates) ?? detail.session.updatedAt
  );
}

export function applySessionListRealtime(
  sessions: SessionListItem[],
  event: RealtimeEvent,
  currentSession: SessionDetail | null
): SessionListItem[] {
  switch (event.type) {
    case "session_status":
      return updateSessionListStatus(sessions, event.sessionId, event.status);
    case "active_turn_updated":
      return updateSessionListActiveTurn(sessions, event.sessionId, event.status, event.activeTurn ?? null);
    case "queued_prompts_updated":
      return updateSessionListQueue(sessions, event.sessionId, (event.queuedPrompts ?? []).length);
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
    case "session_restore_started":
      return updateSessionListContinuity(sessions, event.sessionId, restoringContinuity());
    case "session_restore_succeeded":
      return updateSessionListContinuity(sessions, event.sessionId, restoredContinuity());
    case "session_restore_failed":
      return updateSessionListContinuity(sessions, event.sessionId, restoreFailedContinuity(event.message));
    case "session_config_updated":
      return updateSessionListModel(sessions, event.sessionId, event.currentModel ?? null);
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
          lastActivityAt: status === "running" ? latestTimestamp([item.lastActivityAt, now]) ?? item.lastActivityAt : item.lastActivityAt,
          session: {
            ...item.session,
            status: normalizeSessionListStatus(status, Boolean(item.pendingPermission))
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

function updateSessionListActiveTurn(
  sessions: SessionListItem[],
  sessionId: string,
  status: string,
  activeTurn: SessionListItem["activeTurn"]
) {
  const now = new Date().toISOString();
  const activityAt = activeTurn?.startedAt ?? (status === "running" ? now : null);
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          activeTurn,
          lastActivityAt: activityAt ? latestTimestamp([item.lastActivityAt, activityAt]) ?? item.lastActivityAt : item.lastActivityAt,
          session: {
            ...item.session,
            status: normalizeSessionListStatus(status, Boolean(item.pendingPermission))
          }
        }
      : item
  );
}

function updateSessionListQueue(sessions: SessionListItem[], sessionId: string, queuedPromptCount: number) {
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          queuedPromptCount
        }
      : item
  );
}

export function updateSessionListModel(
  sessions: SessionListItem[],
  sessionId: string,
  currentModel: SessionListItem["currentModel"]
) {
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          currentModel
        }
      : item
  );
}

function updateSessionListContinuity(
  sessions: SessionListItem[],
  sessionId: string,
  continuity: SessionContinuity
) {
  return sessions.map((item) =>
    item.session.id === sessionId
      ? {
          ...item,
          continuity,
          continuable: continuity.continuable,
          viewOnlyReason: continuity.continuable ? null : (continuity.reason ?? null)
        }
      : item
  );
}

function latestTimestamp(values: Array<string | null | undefined>) {
  let bestValue: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const time = Date.parse(trimmed);
    if (Number.isNaN(time)) {
      if (bestValue === null) {
        bestValue = trimmed;
      }
      continue;
    }
    if (time > bestTime || (time === bestTime && (!bestValue || trimmed > bestValue))) {
      bestValue = trimmed;
      bestTime = time;
    }
  }
  return bestValue;
}

function restoringContinuity(): SessionContinuity {
  return {
    state: "restoring",
    continuable: false,
    restorable: false,
    restoring: true,
    reason: "Restoring this agent session...",
    failureMessage: null,
    restoreStartedAt: new Date().toISOString(),
    restoreCompletedAt: null
  };
}

function restoredContinuity(): SessionContinuity {
  return {
    state: "restored",
    continuable: true,
    restorable: false,
    restoring: false,
    reason: null,
    failureMessage: null,
    restoreStartedAt: null,
    restoreCompletedAt: new Date().toISOString()
  };
}

function restoreFailedContinuity(message: string): SessionContinuity {
  return {
    state: "restore_failed",
    continuable: false,
    restorable: true,
    restoring: false,
    reason: message,
    failureMessage: message,
    restoreStartedAt: null,
    restoreCompletedAt: null
  };
}

function normalizeSessionListStatus(status: string, hasPendingPermission: boolean) {
  if (hasPendingPermission && status === "idle") {
    return "waiting_approval";
  }
  return status;
}
