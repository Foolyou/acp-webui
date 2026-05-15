import { describe, expect, test } from "vitest";
import type { AgentRuntimeStatus } from "../types";
import { readLastSessionProfile, writeLastSessionProfile } from "./lastSessionProfile";
import {
  forgetWorkspaceAgent,
  readRememberedWorkspaceAgentId,
  rememberWorkspaceAgent,
  resolveWorkspaceAgentId
} from "./workspaceAgentNavigation";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

function agent(overrides: Partial<AgentRuntimeStatus> = {}): AgentRuntimeStatus {
  return {
    id: "codex",
    title: "Codex",
    enabled: true,
    status: { state: "idle" },
    permissionModes: [],
    launchControls: [],
    ...overrides
  };
}

describe("workspace agent navigation helpers", () => {
  test("stores remembered agents per workspace separately from last session profile", () => {
    const store = storage();

    writeLastSessionProfile({ agentId: "codex", permissionMode: "manual", launchControlValues: {} }, store);
    rememberWorkspaceAgent("workspace-a", "claude", store);
    rememberWorkspaceAgent("workspace-b", "codex", store);

    expect(JSON.parse(store.getItem("workspaceAgentNavigation") ?? "{}")).toEqual({
      version: 1,
      currentAgentIdByWorkspace: {
        "workspace-a": "claude",
        "workspace-b": "codex"
      }
    });
    expect(readLastSessionProfile(store)?.agentId).toBe("codex");
    expect(readRememberedWorkspaceAgentId("workspace-a", store)).toBe("claude");
    expect(readRememberedWorkspaceAgentId("workspace-b", store)).toBe("codex");
  });

  test("resolves a remembered available agent for the workspace", () => {
    const store = storage();
    rememberWorkspaceAgent("workspace-a", "claude", store);
    rememberWorkspaceAgent("workspace-b", "codex", store);

    expect(resolveWorkspaceAgentId("workspace-a", [agent(), agent({ id: "claude", title: "Claude" })], store)).toBe(
      "claude"
    );
  });

  test("forgets a workspace agent without clearing other workspaces", () => {
    const store = storage();
    rememberWorkspaceAgent("workspace-a", "claude", store);
    rememberWorkspaceAgent("workspace-b", "codex", store);

    forgetWorkspaceAgent("workspace-a", store);

    expect(readRememberedWorkspaceAgentId("workspace-a", store)).toBeNull();
    expect(readRememberedWorkspaceAgentId("workspace-b", store)).toBe("codex");
  });

  test("falls back to the first available agent when remembered agent is missing or unavailable", () => {
    const store = storage();
    rememberWorkspaceAgent("workspace-a", "disabled-agent", store);

    expect(
      resolveWorkspaceAgentId(
        "workspace-a",
        [
          agent({ id: "disabled-agent", enabled: false }),
          agent({ id: "also-disabled", status: { state: "disabled" } }),
          agent({ id: "codex" })
        ],
        store
      )
    ).toBe("codex");
  });

  test("returns null when no available agents exist or stored state is invalid", () => {
    const store = storage();
    store.setItem("workspaceAgentNavigation", "{not json");

    expect(resolveWorkspaceAgentId("workspace-a", [agent({ enabled: false })], store)).toBeNull();
    expect(readRememberedWorkspaceAgentId("workspace-a", store)).toBeNull();
  });
});
