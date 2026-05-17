import { describe, expect, test, vi } from "vitest";
import { createSessionFromCompose } from "./sessionComposeCreation";
import type { SessionDetail } from "../types";

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: "session-created",
      workspaceId: "workspace-a",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      status: "idle",
      createdAt: "2026-04-30T00:00:00Z",
      updatedAt: "2026-04-30T00:00:00Z"
    },
    workspace: {
      id: "workspace-a",
      name: "Workspace",
      path: "<project-path>",
      createdAt: "2026-04-30T00:00:00Z"
    },
    messages: [],
    queuedPrompts: [],
    activeTurn: null,
    reviewArtifacts: [],
    timeline: [],
    continuity: {
      state: "live",
      continuable: true,
      restorable: false,
      restoring: false
    },
    continuable: true,
    ...overrides
  };
}

describe("createSessionFromCompose", () => {
  test("creates an empty session before submitting the compose prompt", async () => {
    const calls: string[] = [];
    const created = detail();
    const createSession = vi.fn(async () => {
      calls.push("create");
      return created;
    });
    const onSessionCreated = vi.fn(async () => {
      calls.push("created-callback");
    });
    const submitPrompt = vi.fn(async () => {
      calls.push("prompt");
    });

    await createSessionFromCompose({
      workspaceId: "workspace-a",
      agentId: "codex",
      permissionMode: "manual",
      launchControlValues: { model: "fast", permission: "manual" },
      initialPrompt: "Plan the fix",
      contentBlocks: [{ type: "image", mimeType: "image/png", data: "abcd" }],
      createSession,
      onSessionCreated,
      submitPrompt
    });

    expect(calls).toEqual(["create", "created-callback", "prompt"]);
    expect(createSession).toHaveBeenCalledWith("workspace-a", "codex", "manual", {
      model: "fast",
      permission: "manual"
    });
    expect(onSessionCreated).toHaveBeenCalledWith(created);
    expect(submitPrompt).toHaveBeenCalledWith(created, "Plan the fix", [
      { type: "image", mimeType: "image/png", data: "abcd" }
    ]);
  });

  test("skips prompt submission when no prompt content is present", async () => {
    const createSession = vi.fn(async () => detail());
    const onSessionCreated = vi.fn(async () => {});
    const submitPrompt = vi.fn(async () => {});

    await createSessionFromCompose({
      workspaceId: "workspace-a",
      initialPrompt: "   ",
      createSession,
      onSessionCreated,
      submitPrompt
    });

    expect(createSession).toHaveBeenCalledWith("workspace-a", undefined, undefined, undefined);
    expect(onSessionCreated).toHaveBeenCalledOnce();
    expect(submitPrompt).not.toHaveBeenCalled();
  });
});
