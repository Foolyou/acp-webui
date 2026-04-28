import type {
  ChatMessage,
  InboxItem,
  PermissionRequest,
  RealtimeEvent,
  ReviewArtifactSummary,
  SessionContinuity,
  SessionDetail,
  TimelineItem
} from "./types";

export type AppSnapshot = {
  currentSession: SessionDetail | null;
  inbox: InboxItem[];
  liveAssistant: string;
  error: string | null;
};

export function applyRealtimeEvent(state: AppSnapshot, event: RealtimeEvent): AppSnapshot {
  switch (event.type) {
    case "text_delta":
      if (state.currentSession?.session.id !== event.sessionId) {
        return state;
      }
      return { ...state, liveAssistant: state.liveAssistant + event.delta };

    case "assistant_message":
      if (state.currentSession?.session.id !== event.sessionId) {
        return state;
      }
      return {
        ...state,
        currentSession: {
          ...state.currentSession,
          messages: [...state.currentSession.messages, assistantMessage(state.currentSession.session.id, event.content)]
        },
        liveAssistant: ""
      };

    case "session_status":
      if (state.currentSession?.session.id !== event.sessionId) {
        return state;
      }
      return {
        ...state,
        currentSession: {
          ...state.currentSession,
          session: {
            ...state.currentSession.session,
            status: normalizeSessionStatus(event.status, Boolean(state.currentSession.pendingPermission))
          }
        }
      };

    case "permission_requested":
      return applyPermissionRequested(state, event);

    case "permission_resolved":
      return applyPermissionResolved(state, event);

    case "review_artifact":
      return applyReviewArtifact(state, event.artifact);

    case "timeline_item_upsert":
      return applyTimelineItemUpsert(state, event.item);

    case "session_restore_started":
      return applySessionRestoreEvent(state, event.sessionId, restoringContinuity());

    case "session_restore_succeeded":
      return applySessionRestoreEvent(state, event.sessionId, restoredContinuity());

    case "session_restore_failed":
      return applySessionRestoreEvent(state, event.sessionId, restoreFailedContinuity(event.message));

    case "error":
      return { ...state, error: event.message };

    case "connection_status":
      return state;
  }
}

function applySessionRestoreEvent(
  state: AppSnapshot,
  sessionId: string,
  continuity: SessionContinuity
): AppSnapshot {
  if (state.currentSession?.session.id !== sessionId) {
    return state;
  }
  return {
    ...state,
    currentSession: {
      ...state.currentSession,
      continuity,
      continuable: continuity.continuable,
      viewOnlyReason: continuity.continuable ? null : (continuity.reason ?? null)
    }
  };
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

function normalizeSessionStatus(status: string, hasPendingPermission: boolean) {
  if (hasPendingPermission && status === "idle") {
    return "waiting_approval";
  }
  return status;
}

function applyPermissionRequested(
  state: AppSnapshot,
  event: Extract<RealtimeEvent, { type: "permission_requested" }>
): AppSnapshot {
  const permission = event.permission;
  const activePermission = event.activePermission ?? permission;
  const currentSession =
    state.currentSession?.session.id === permission.sessionId
      ? withApprovalQueue(
          state.currentSession,
          mergePermissionQueue(
            mergePermissionQueue(approvalQueue(state.currentSession), activePermission),
            permission
          ),
          activePermission,
          event.pendingApprovalCount,
          event.queuedApprovalCount,
          "waiting_approval"
        )
      : state.currentSession;

  const existing = state.inbox.find((item) => item.session.id === permission.sessionId);
  const queuedApprovalCount =
    event.queuedApprovalCount ?? Math.max((event.pendingApprovalCount ?? 1) - 1, 0);
  if (existing) {
    return {
      ...state,
      currentSession,
      inbox: state.inbox.map((item) =>
        item.session.id === permission.sessionId
          ? {
              ...item,
              permission: activePermission,
              queuedApprovalCount,
              session: { ...item.session, status: "waiting_approval" }
            }
          : item
      )
    };
  }

  if (currentSession?.session.id === permission.sessionId) {
    return {
      ...state,
      currentSession,
      inbox: [
        {
          session: currentSession.session,
          workspace: currentSession.workspace,
          permission: activePermission,
          queuedApprovalCount
        },
        ...state.inbox
      ]
    };
  }

  return { ...state, currentSession };
}

function applyPermissionResolved(
  state: AppSnapshot,
  event: Extract<RealtimeEvent, { type: "permission_resolved" }>
): AppSnapshot {
  const currentSession =
    state.currentSession?.session.id === event.sessionId
      ? withApprovalQueue(
          state.currentSession,
          event.nextPermission
            ? mergePermissionQueue(
                approvalQueue(state.currentSession).filter((item) => item.id !== event.permissionId),
                event.nextPermission
              )
            : approvalQueue(state.currentSession).filter((item) => item.id !== event.permissionId),
          event.nextPermission ?? null,
          event.pendingApprovalCount,
          event.queuedApprovalCount,
          event.nextPermission ? "waiting_approval" : "running"
        )
      : state.currentSession;

  return {
    ...state,
    currentSession,
    inbox: state.inbox.flatMap((item) => {
      if (item.session.id !== event.sessionId) {
        return [item];
      }
      if (!event.nextPermission) {
        return [];
      }
      return [
        {
          ...item,
          permission: event.nextPermission,
          queuedApprovalCount: event.queuedApprovalCount ?? 0,
          session: { ...item.session, status: "waiting_approval" }
        }
      ];
    })
  };
}

function approvalQueue(session: SessionDetail): PermissionRequest[] {
  const queue = session.pendingPermissions?.length
    ? session.pendingPermissions
    : session.pendingPermission
      ? [session.pendingPermission]
      : [];
  return sortPermissionQueue(queue);
}

function mergePermissionQueue(queue: PermissionRequest[], permission: PermissionRequest | null): PermissionRequest[] {
  if (!permission) {
    return sortPermissionQueue(queue);
  }
  const existing = queue.some((item) => item.id === permission.id);
  const next = existing ? queue.map((item) => (item.id === permission.id ? permission : item)) : [...queue, permission];
  return sortPermissionQueue(next);
}

function sortPermissionQueue(queue: PermissionRequest[]): PermissionRequest[] {
  return [...queue].sort((left, right) => {
    const byDate = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return byDate || left.id.localeCompare(right.id);
  });
}

function withApprovalQueue(
  session: SessionDetail,
  queue: PermissionRequest[],
  activePermission: PermissionRequest | null,
  pendingApprovalCount?: number,
  queuedApprovalCount?: number,
  nextStatus?: string
): SessionDetail {
  const normalizedQueue = sortPermissionQueue(queue);
  const count = pendingApprovalCount ?? normalizedQueue.length;
  const active = count > 0 ? activePermission ?? normalizedQueue[0] ?? null : null;
  const nextQueue = count > 0 ? normalizedQueue : [];
  return {
    ...session,
    pendingPermission: active,
    pendingPermissions: nextQueue,
    pendingApprovalCount: count,
    queuedApprovalCount: queuedApprovalCount ?? Math.max(count - 1, 0),
    session: {
      ...session.session,
      status: nextStatus ?? (active ? "waiting_approval" : session.session.status)
    }
  };
}

function applyReviewArtifact(state: AppSnapshot, artifact: ReviewArtifactSummary): AppSnapshot {
  if (state.currentSession?.session.id !== artifact.sessionId) {
    return state;
  }
  const existingIndex = state.currentSession.reviewArtifacts.findIndex((item) => item.id === artifact.id);
  const reviewArtifacts =
    existingIndex >= 0
      ? state.currentSession.reviewArtifacts.map((item) => (item.id === artifact.id ? artifact : item))
      : [...state.currentSession.reviewArtifacts, artifact];
  const messages = state.liveAssistant
    ? [...state.currentSession.messages, assistantMessage(state.currentSession.session.id, state.liveAssistant)]
    : state.currentSession.messages;

  return {
    ...state,
    currentSession: {
      ...state.currentSession,
      messages,
      reviewArtifacts,
      timeline: upsertTimelineItem(
        state.currentSession.timeline,
        {
          kind: "review_artifact",
          id: artifact.id,
          sessionId: artifact.sessionId,
          timestamp: artifact.createdAt,
          status: "idle",
          toolCallId: artifact.toolCallId,
          artifactKind: artifact.kind,
          title: artifact.title,
          summary: artifact.summary,
          source: artifact.source
        }
      )
    },
    liveAssistant: ""
  };
}

function applyTimelineItemUpsert(state: AppSnapshot, item: TimelineItem): AppSnapshot {
  if (state.currentSession?.session.id !== item.sessionId) {
    return state;
  }
  return {
    ...state,
    currentSession: {
      ...state.currentSession,
      timeline: upsertTimelineItem(state.currentSession.timeline, item)
    },
    liveAssistant: item.kind === "message" && item.role === "assistant" ? "" : state.liveAssistant
  };
}

function upsertTimelineItem(items: TimelineItem[], item: TimelineItem): TimelineItem[] {
  const key = `${item.kind}-${item.id}`;
  const existing = items.some((candidate) => `${candidate.kind}-${candidate.id}` === key);
  const next = existing
    ? items.map((candidate) => (`${candidate.kind}-${candidate.id}` === key ? item : candidate))
    : [...items, item];
  return next.sort((left, right) => Date.parse(timestamp(left)) - Date.parse(timestamp(right)));
}

function timestamp(item: TimelineItem) {
  return item.timestamp;
}

function assistantMessage(sessionId: string, content: string): ChatMessage {
  return {
    id: `live-${Date.now()}`,
    sessionId,
    role: "assistant",
    content,
    status: "idle",
    createdAt: new Date().toISOString()
  };
}
