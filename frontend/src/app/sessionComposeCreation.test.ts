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
  test("creates an empty session without submitting a compose prompt", async () => {
    const calls: string[] = [];
    const created = detail();
    const createSession = vi.fn(async () => {
      calls.push("create");
      return created;
    });
    const onSessionCreated = vi.fn(async () => {
      calls.push("created-callback");
    });
    await createSessionFromCompose({
      workspaceId: "workspace-a",
      agentId: "codex",
      permissionMode: "manual",
      launchControlValues: { model: "fast", permission: "manual" },
      createSession,
      onSessionCreated
    });

    expect(calls).toEqual(["create", "created-callback"]);
    expect(createSession).toHaveBeenCalledWith("workspace-a", "codex", "manual", {
      model: "fast",
      permission: "manual"
    });
    expect(onSessionCreated).toHaveBeenCalledWith(created);
  });

  test("creates sessions without launch overrides", async () => {
    const createSession = vi.fn(async () => detail());
    const onSessionCreated = vi.fn(async () => {});

    await createSessionFromCompose({
      workspaceId: "workspace-a",
      createSession,
      onSessionCreated
    });

    expect(createSession).toHaveBeenCalledWith("workspace-a", undefined, undefined, undefined);
    expect(onSessionCreated).toHaveBeenCalledOnce();
  });
});
