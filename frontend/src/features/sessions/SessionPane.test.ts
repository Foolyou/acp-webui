import { describe, expect, test } from "vitest";
import { formatActiveTurnElapsed } from "./SessionPane";

describe("formatActiveTurnElapsed", () => {
  test("formats active work time in seconds and minutes", () => {
    expect(formatActiveTurnElapsed("2026-04-30T00:00:00Z", Date.parse("2026-04-30T00:00:09Z"))).toBe("9s");
    expect(formatActiveTurnElapsed("2026-04-30T00:00:00Z", Date.parse("2026-04-30T00:02:05Z"))).toBe("2m 05s");
  });
});
