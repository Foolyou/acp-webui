import { describe, expect, test } from "vitest";
import type { AgentRuntimeStatus, Session } from "../types";
import {
  fallbackPermissionModes,
  isYoloSession,
  permissionModeClass,
  permissionModeDescription,
  permissionModeLabel
} from "./permissionMode";

function agent(permissionModes: AgentRuntimeStatus["permissionModes"]): AgentRuntimeStatus {
  return {
    id: "codex",
    title: "Codex",
    enabled: true,
    status: { state: "idle", message: "Not started" },
    permissionModes
  };
}

function session(permissionMode: Session["permissionMode"]): Session {
  return {
    id: "session",
    workspaceId: "workspace",
    agentId: "codex",
    agentName: "Codex",
    permissionMode,
    acpSessionId: "acp-session",
    externalSessionId: "acp-session",
    status: "idle",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };
}

describe("permission mode helpers", () => {
  test("uses advertised agent modes and keeps unsupported modes hidden", () => {
    const modes = fallbackPermissionModes(
      agent([
        {
          id: "manual",
          label: "Manual",
          description: "Ask first",
          riskLevel: "low",
          status: { state: "idle" }
        }
      ])
    );

    expect(modes.map((mode) => mode.id)).toEqual(["manual"]);
    expect(modes.some((mode) => mode.id === "yolo")).toBe(false);
  });

  test("labels yolo as a persistent high-risk indicator", () => {
    expect(permissionModeLabel("yolo")).toBe("YOLO");
    expect(permissionModeDescription("yolo")).toBe("No approvals / no sandbox");
    expect(permissionModeClass("full_auto")).toBe("permission-mode-full-auto");
    expect(isYoloSession(session("yolo"))).toBe(true);
    expect(isYoloSession(session("manual"))).toBe(false);
  });
});
