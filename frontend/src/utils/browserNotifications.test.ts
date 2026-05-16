import { describe, expect, test, vi } from "vitest";
import {
  browserNotificationState,
  notifyForRealtimeTransition,
  notifyPermissionRequest,
  notifyTurnComplete,
  requestBrowserNotificationPermission,
  shouldNotifyTurnComplete,
  type BrowserNotificationSource
} from "./browserNotifications";
import type { ActiveTurn, PermissionRequest, SessionDetail } from "../types";

function notificationEnv(permission: NotificationPermission | "unsupported") {
  const notifications: Array<{ title: string; options?: NotificationOptions }> = [];
  const requestPermission = vi.fn(async () => (permission === "unsupported" ? "denied" : permission));
  if (permission === "unsupported") {
    return { NotificationCtor: undefined as BrowserNotificationSource | undefined, notifications, requestPermission };
  }
  const NotificationCtor =
    class {
      static permission = permission;
      static requestPermission = requestPermission;
      constructor(title: string, options?: NotificationOptions) {
        notifications.push({ title, options });
      }
    } as unknown as BrowserNotificationSource;
  return { NotificationCtor, notifications, requestPermission };
}

function permissionRequest(title = "Run command"): PermissionRequest {
  return {
    id: "permission-1",
    sessionId: "session-1",
    acpSessionId: "acp-session",
    title,
    kind: "execute",
    status: "pending",
    toolCall: {},
    options: [],
    createdAt: "2026-05-16T00:00:00Z"
  };
}

function sessionDetail(activeTurn: ActiveTurn | null, status = "running"): SessionDetail {
  return {
    session: {
      id: "session-1",
      workspaceId: "workspace-1",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      status,
      createdAt: "2026-05-16T00:00:00Z",
      updatedAt: "2026-05-16T00:00:00Z"
    },
    workspace: {
      id: "workspace-1",
      name: "Workspace",
      path: "<project-path>",
      createdAt: "2026-05-16T00:00:00Z"
    },
    messages: [],
    activeTurn,
    reviewArtifacts: [],
    timeline: [],
    continuity: { state: "live", continuable: true, restorable: false, restoring: false },
    continuable: true
  };
}

describe("browserNotificationState", () => {
  test("reports unsupported browsers", () => {
    const { NotificationCtor } = notificationEnv("unsupported");
    expect(browserNotificationState(NotificationCtor)).toEqual({ supported: false, permission: "unsupported", enabled: false });
  });

  test("reports granted, denied, and default states", () => {
    expect(browserNotificationState(notificationEnv("granted").NotificationCtor)).toEqual({
      supported: true,
      permission: "granted",
      enabled: true
    });
    expect(browserNotificationState(notificationEnv("denied").NotificationCtor)).toEqual({
      supported: true,
      permission: "denied",
      enabled: false
    });
    expect(browserNotificationState(notificationEnv("default").NotificationCtor)).toEqual({
      supported: true,
      permission: "default",
      enabled: false
    });
  });
});

describe("requestBrowserNotificationPermission", () => {
  test("requests permission only when supported and not denied", async () => {
    const waiting = notificationEnv("default");
    await expect(requestBrowserNotificationPermission(waiting.NotificationCtor)).resolves.toBe("default");
    expect(waiting.requestPermission).toHaveBeenCalledTimes(1);

    const granted = notificationEnv("granted");
    await expect(requestBrowserNotificationPermission(granted.NotificationCtor)).resolves.toBe("granted");
    expect(granted.requestPermission).not.toHaveBeenCalled();

    const denied = notificationEnv("denied");
    await expect(requestBrowserNotificationPermission(denied.NotificationCtor)).resolves.toBe("denied");
    expect(denied.requestPermission).not.toHaveBeenCalled();
  });
});

describe("notification delivery", () => {
  test("notifies for permission requests when granted", () => {
    const env = notificationEnv("granted");
    expect(notifyPermissionRequest(permissionRequest(), env.NotificationCtor)).toBe(true);
    expect(env.notifications).toEqual([
      { title: "Approval needed", options: { body: "Run command", tag: "permission-session-1" } }
    ]);
  });

  test("does not notify without granted permission", () => {
    const env = notificationEnv("default");
    expect(notifyPermissionRequest(permissionRequest(), env.NotificationCtor)).toBe(false);
    expect(env.notifications).toEqual([]);
  });

  test("detects a running turn completion exactly on transition", () => {
    const running = sessionDetail({ startedAt: "turn-1", status: "running" }, "running");
    const idle = sessionDetail(null, "idle");
    expect(shouldNotifyTurnComplete(running, idle)).toBe(true);
    expect(shouldNotifyTurnComplete(idle, idle)).toBe(false);
  });

  test("notifies for completed turns when granted", () => {
    const env = notificationEnv("granted");
    expect(notifyTurnComplete(sessionDetail(null, "idle"), env.NotificationCtor)).toBe(true);
    expect(env.notifications).toEqual([
      { title: "Turn complete", options: { body: "Codex is idle.", tag: "turn-complete-session-1" } }
    ]);
  });

  test("routes permission request realtime events to notifications", () => {
    const env = notificationEnv("granted");
    const delivered = notifyForRealtimeTransition(
      null,
      null,
      { type: "permission_requested", permission: permissionRequest() },
      new Set(),
      env.NotificationCtor
    );

    expect(delivered).toBe(true);
    expect(env.notifications[0]).toMatchObject({ title: "Approval needed" });
  });

  test("routes turn completion transitions once", () => {
    const env = notificationEnv("granted");
    const seen = new Set<string>();
    const running = sessionDetail({ startedAt: "turn-1", status: "running" }, "running");
    const idle = sessionDetail(null, "idle");
    const event = { type: "active_turn_updated" as const, sessionId: "session-1", status: "idle", activeTurn: null };

    expect(notifyForRealtimeTransition(running, idle, event, seen, env.NotificationCtor)).toBe(true);
    expect(notifyForRealtimeTransition(running, idle, event, seen, env.NotificationCtor)).toBe(false);
    expect(env.notifications).toHaveLength(1);
    expect(env.notifications[0]).toMatchObject({ title: "Turn complete" });
  });
});
