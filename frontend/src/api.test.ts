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
});
