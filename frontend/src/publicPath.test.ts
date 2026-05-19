import { describe, expect, test } from "vitest";
import { basePathFromPublicPath, publicPath } from "./publicPath";

describe("public path helpers", () => {
  test("normalizes Vite public paths to app base paths", () => {
    expect(basePathFromPublicPath("/")).toBe("");
    expect(basePathFromPublicPath("/acp")).toBe("/acp");
    expect(basePathFromPublicPath("/acp/")).toBe("/acp");
    expect(basePathFromPublicPath("https://example.test/acp/")).toBe("/acp");
  });

  test("uses the default root public path in tests", () => {
    expect(publicPath("/api/auth/status")).toBe("/api/auth/status");
    expect(publicPath("api/auth/status")).toBe("/api/auth/status");
  });
});

