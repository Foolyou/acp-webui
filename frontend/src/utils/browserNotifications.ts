import type { PermissionRequest, RealtimeEvent, SessionDetail } from "../types";

export type BrowserNotificationPermission = NotificationPermission | "unsupported";

export type BrowserNotificationState = {
  supported: boolean;
  permission: BrowserNotificationPermission;
  enabled: boolean;
};

export type BrowserNotificationSource = {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): Notification;
};

export function browserNotificationState(
  source: BrowserNotificationSource | undefined = notificationSource()
): BrowserNotificationState {
  if (!source) {
    return { supported: false, permission: "unsupported", enabled: false };
  }
  return {
    supported: true,
    permission: source.permission,
    enabled: source.permission === "granted"
  };
}

export async function requestBrowserNotificationPermission(
  source: BrowserNotificationSource | undefined = notificationSource()
): Promise<BrowserNotificationPermission> {
  const state = browserNotificationState(source);
  if (!state.supported || !source) return "unsupported";
  if (state.permission === "denied") return "denied";
  if (state.permission === "granted") return "granted";
  return source.requestPermission();
}

export function notifyPermissionRequest(
  permission: PermissionRequest,
  source: BrowserNotificationSource | undefined = notificationSource()
) {
  return showBrowserNotification(
    "Approval needed",
    {
      body: permission.title || "A session is waiting for approval.",
      tag: `permission-${permission.sessionId}`
    },
    source
  );
}

export function shouldNotifyTurnComplete(previous: SessionDetail | null, next: SessionDetail | null) {
  if (!previous || !next || previous.session.id !== next.session.id) return false;
  const previousStatus = previous.activeTurn?.status;
  const wasActive = previousStatus === "running" || previousStatus === "stopping";
  return wasActive && !next.activeTurn && next.session.status === "idle";
}

export function turnCompletionNotificationKey(previous: SessionDetail | null, next: SessionDetail | null) {
  if (!shouldNotifyTurnComplete(previous, next) || !next) return null;
  return `${next.session.id}:${previous?.activeTurn?.startedAt ?? ""}`;
}

export function notifyTurnComplete(
  session: SessionDetail,
  source: BrowserNotificationSource | undefined = notificationSource()
) {
  return showBrowserNotification(
    "Turn complete",
    {
      body: `${session.session.agentName} is idle.`,
      tag: `turn-complete-${session.session.id}`
    },
    source
  );
}

export function notifyForRealtimeTransition(
  previousSession: SessionDetail | null,
  nextSession: SessionDetail | null,
  event: RealtimeEvent,
  completedTurns: Set<string>,
  source: BrowserNotificationSource | undefined = notificationSource()
) {
  if (event.type === "permission_requested") {
    return notifyPermissionRequest(event.permission, source);
  }
  if (event.type !== "active_turn_updated") {
    return false;
  }
  const key = turnCompletionNotificationKey(previousSession, nextSession);
  if (!key || completedTurns.has(key) || !nextSession) {
    return false;
  }
  completedTurns.add(key);
  return notifyTurnComplete(nextSession, source);
}

function showBrowserNotification(
  title: string,
  options: NotificationOptions,
  source: BrowserNotificationSource | undefined = notificationSource()
) {
  if (browserNotificationState(source).permission !== "granted" || !source) {
    return false;
  }
  new source(title, options);
  return true;
}

function notificationSource() {
  return typeof Notification === "undefined" ? undefined : Notification;
}
