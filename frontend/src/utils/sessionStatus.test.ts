import { describe, expect, test } from "vitest";
import { sessionStatusLabel } from "./sessionStatus";

describe("sessionStatusLabel", () => {
  test("maps session status values to user-facing labels", () => {
    expect(sessionStatusLabel("idle")).toBe("Ready");
    expect(sessionStatusLabel("running")).toBe("Working");
    expect(sessionStatusLabel("waiting_approval")).toBe("Waiting approval");
    expect(sessionStatusLabel("stopping")).toBe("Stopping");
    expect(sessionStatusLabel("stopped")).toBe("Stopped");
    expect(sessionStatusLabel("failed")).toBe("Failed");
  });

  test("humanizes unknown status values", () => {
    expect(sessionStatusLabel("custom_state")).toBe("Custom state");
    expect(sessionStatusLabel("")).toBe("Unknown");
  });
});
