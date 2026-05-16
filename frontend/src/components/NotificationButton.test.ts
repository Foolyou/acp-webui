import { describe, expect, test } from "vitest";
import { notificationButtonState } from "./NotificationButton";

describe("notificationButtonState", () => {
  test("labels default permission as an enable action", () => {
    expect(notificationButtonState({ supported: true, permission: "default", enabled: false })).toEqual({
      available: true,
      disabled: false,
      active: false,
      label: "Enable notifications"
    });
  });

  test("labels granted permission as enabled", () => {
    expect(notificationButtonState({ supported: true, permission: "granted", enabled: true })).toEqual({
      available: true,
      disabled: false,
      active: true,
      label: "Notifications enabled"
    });
  });

  test("keeps denied notifications visible but disabled", () => {
    expect(notificationButtonState({ supported: true, permission: "denied", enabled: false })).toEqual({
      available: true,
      disabled: true,
      active: false,
      label: "Notifications blocked"
    });
  });

  test("hides unsupported notification controls", () => {
    expect(notificationButtonState({ supported: false, permission: "unsupported", enabled: false })).toEqual({
      available: false,
      disabled: true,
      active: false,
      label: "Notifications unavailable"
    });
  });
});
