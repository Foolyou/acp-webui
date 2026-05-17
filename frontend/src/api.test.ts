import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./api";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("requests workspace-agent scoped sessions with encoded route params", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));
    vi.stubGlobal("fetch", fetch);

    await api.workspaceAgentSessions("workspace/a", "agent:b");

    expect(fetch).toHaveBeenCalledWith("/api/workspaces/workspace%2Fa/agents/agent%3Ab/sessions", {
      headers: { "content-type": "application/json", "x-acp-webui-request": "1" }
    });
  });

  test("uploads audio transcription requests as form data without JSON content type", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "hello" })
    }));
    vi.stubGlobal("fetch", fetch);

    const response = await api.transcribeAudio(new Blob(["audio"], { type: "audio/webm" }), "recording.webm");

    expect(response.text).toBe("hello");
    expect(fetch).toHaveBeenCalledWith("/api/audio/transcriptions", {
      method: "POST",
      headers: { "x-acp-webui-request": "1" },
      body: expect.any(FormData)
    });
  });

  test("creates sessions with optional initial prompt and content blocks", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ session: { id: "session-a" }, workspace: { id: "workspace/a" } })
    }));
    vi.stubGlobal("fetch", fetch);

    await api.createSession(
      "workspace/a",
      "codex",
      "manual",
      { model: "fast", permission: "manual" },
      "Plan the fix",
      [{ type: "image", mimeType: "image/png", data: "abcd" }]
    );

    expect(fetch).toHaveBeenCalledWith("/api/workspaces/workspace%2Fa/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-acp-webui-request": "1" },
      body: JSON.stringify({
        agentId: "codex",
        permissionMode: "manual",
        launchControlValues: { model: "fast", permission: "manual" },
        initialPrompt: "Plan the fix",
        contentBlocks: [{ type: "image", mimeType: "image/png", data: "abcd" }]
      })
    });
  });

  test("creates empty sessions when compose prompt dispatch is handled separately", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ session: { id: "session-a" }, workspace: { id: "workspace/a" } })
    }));
    vi.stubGlobal("fetch", fetch);

    await api.createSession("workspace/a", "codex", "manual", { model: "fast", permission: "manual" });

    expect(fetch).toHaveBeenCalledWith("/api/workspaces/workspace%2Fa/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-acp-webui-request": "1" },
      body: JSON.stringify({
        agentId: "codex",
        permissionMode: "manual",
        launchControlValues: { model: "fast", permission: "manual" }
      })
    });
  });

  test("submits prompt content through the prompt endpoint", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ message: { id: "message-a" } })
    }));
    vi.stubGlobal("fetch", fetch);

    await api.prompt("session/a", "Plan the fix", [{ type: "image", mimeType: "image/png", data: "abcd" }]);

    expect(fetch).toHaveBeenCalledWith("/api/sessions/session/a/prompt", {
      method: "POST",
      headers: { "content-type": "application/json", "x-acp-webui-request": "1" },
      body: JSON.stringify({
        prompt: "Plan the fix",
        contentBlocks: [{ type: "image", mimeType: "image/png", data: "abcd" }]
      })
    });
  });
});
