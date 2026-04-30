import { describe, expect, test } from "vitest";
import type { AgentRuntimeStatus } from "../types";
import { normalizeLaunchControlValues, resolveLastSessionProfile } from "./lastSessionProfile";

function agent(overrides: Partial<AgentRuntimeStatus> = {}): AgentRuntimeStatus {
  return {
    id: "codex",
    title: "Codex",
    enabled: true,
    status: { state: "ready" },
    permissionModes: [
      {
        id: "manual",
        label: "Manual",
        description: "Ask before actions",
        riskLevel: "low",
        status: { state: "ready" }
      },
      {
        id: "yolo",
        label: "YOLO",
        description: "No approvals / no sandbox",
        riskLevel: "high",
        status: { state: "disabled", message: "Unavailable" }
      }
    ],
    launchControls: [
      {
        id: "model",
        label: "Model",
        category: "model",
        scope: "launch",
        type: "select",
        defaultValue: "fast",
        options: [
          { value: "fast", label: "Fast" },
          { value: "pro", label: "Pro" }
        ]
      }
    ],
    ...overrides
  };
}

describe("last session profile helpers", () => {
  test("resolves a launchable stored profile", () => {
    const resolved = resolveLastSessionProfile([agent()], {
      agentId: "codex",
      permissionMode: "manual",
      launchControlValues: { model: "pro" }
    });
    expect(resolved?.agent.title).toBe("Codex");
    expect(resolved?.modeLabel).toBe("Manual");
    expect(resolved?.launchControlValues.model).toBe("pro");
  });

  test("rejects missing agents and unavailable modes", () => {
    expect(
      resolveLastSessionProfile([agent()], {
        agentId: "claude",
        permissionMode: "manual",
        launchControlValues: {}
      })
    ).toBeNull();
    expect(
      resolveLastSessionProfile([agent()], {
        agentId: "codex",
        permissionMode: "yolo",
        launchControlValues: {}
      })
    ).toBeNull();
  });

  test("normalizes stale launch control values to defaults", () => {
    expect(normalizeLaunchControlValues(agent(), { model: "removed" })).toEqual({ model: "fast" });
  });
});
