import { afterEach, describe, expect, test, vi } from "vitest";
import { basePathFromPublicPath, publicPath } from "./publicPath";

describe("public path helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("normalizes Vite public paths to app base paths", () => {
    expect(basePathFromPublicPath("/")).toBe("");
    expect(basePathFromPublicPath("./")).toBe("");
    expect(basePathFromPublicPath("/acp")).toBe("/acp");
    expect(basePathFromPublicPath("/acp/")).toBe("/acp");
    expect(basePathFromPublicPath("https://example.test/acp/")).toBe("/acp");
  });

  test("uses the default root public path in tests", () => {
    expect(publicPath("/api/auth/status")).toBe("/api/auth/status");
    expect(publicPath("api/auth/status")).toBe("/api/auth/status");
  });

  test("prefers the runtime base path injected by the backend", async () => {
    vi.stubGlobal("window", { __ACP_WEBUI_BASE_PATH__: "/acp/" });
    vi.resetModules();

    const runtime = await import("./publicPath");

    expect(runtime.frontendBasePath).toBe("/acp");
    expect(runtime.publicPath("/api/auth/status")).toBe("/acp/api/auth/status");
  });
});
