import type {
  ChatMessage,
  InboxItem,
  PermissionRequest,
  RealtimeEvent,
  ReviewArtifactSummary,
  SessionDetail
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
          session: { ...state.currentSession.session, status: event.status }
        }
      };

    case "permission_requested":
      return applyPermissionRequested(state, event.permission);

    case "permission_resolved":
      return {
        ...state,
        inbox: state.inbox.filter((item) => item.permission.id !== event.permissionId),
        currentSession:
          state.currentSession?.session.id === event.sessionId
            ? {
                ...state.currentSession,
                pendingPermission: null
              }
            : state.currentSession
      };

    case "review_artifact":
      return applyReviewArtifact(state, event.artifact);

    case "error":
      return { ...state, error: event.message };

    case "connection_status":
      return state;
  }
}

function applyPermissionRequested(state: AppSnapshot, permission: PermissionRequest): AppSnapshot {
  const currentSession =
    state.currentSession?.session.id === permission.sessionId
      ? {
          ...state.currentSession,
          pendingPermission: permission,
          session: { ...state.currentSession.session, status: "waiting_approval" }
        }
      : state.currentSession;

  const existing = state.inbox.find((item) => item.session.id === permission.sessionId);
  if (existing) {
    return {
      ...state,
      currentSession,
      inbox: state.inbox.map((item) =>
        item.session.id === permission.sessionId
          ? { ...item, permission, session: { ...item.session, status: "waiting_approval" } }
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
          permission
        },
        ...state.inbox
      ]
    };
  }

  return { ...state, currentSession };
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
      reviewArtifacts
    },
    liveAssistant: ""
  };
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
