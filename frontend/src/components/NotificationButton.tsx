import { useCallback, useEffect, useState } from "react";
import { Button } from "react-aria-components";
import {
  browserNotificationState,
  requestBrowserNotificationPermission,
  type BrowserNotificationState
} from "../utils/browserNotifications";

export function NotificationButton() {
  const [state, setState] = useState<BrowserNotificationState>(() => browserNotificationState());

  useEffect(() => {
    setState(browserNotificationState());
  }, []);

  const requestPermission = useCallback(async () => {
    const nextPermission = await requestBrowserNotificationPermission();
    setState(browserNotificationStateFromPermission(nextPermission));
  }, []);

  const button = notificationButtonState(state);
  if (!button.available) return null;

  return (
    <Button
      aria-label={button.label}
      className={`icon-button notification-toggle ${button.active ? "active" : ""}`}
      data-tooltip={button.label}
      isDisabled={button.disabled}
      onPress={() => {
        void requestPermission();
      }}
    >
      <span aria-hidden="true" className="notification-bell" />
      <span aria-hidden="true" className="notification-clapper" />
      <span className="visually-hidden">{button.label}</span>
    </Button>
  );
}

export function notificationButtonState(state: BrowserNotificationState) {
  switch (state.permission) {
    case "granted":
      return { available: true, disabled: false, active: true, label: "Notifications enabled" };
    case "denied":
      return { available: true, disabled: true, active: false, label: "Notifications blocked" };
    case "unsupported":
      return { available: false, disabled: true, active: false, label: "Notifications unavailable" };
    default:
      return { available: state.supported, disabled: !state.supported, active: false, label: "Enable notifications" };
  }
}

function browserNotificationStateFromPermission(permission: BrowserNotificationState["permission"]) {
  if (permission === "unsupported") {
    return { supported: false, permission, enabled: false };
  }
  return { supported: true, permission, enabled: permission === "granted" };
}
