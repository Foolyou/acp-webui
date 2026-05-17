import { describe, expect, test } from "vitest";
import { applySessionListRealtime, sessionDetailToListItem } from "./sessionList";
import { applyRealtimeEvent } from "../realtime";
import { modelConfigOption, modelSwitchDisabledReason, selectValues, sessionConfigSelectOptions } from "./sessionConfig";
import type { ConnectionStatus, SessionDetail } from "../types";

const continuity = {
  state: "live",
  continuable: true,
  restorable: false,
  restoring: false,
  reason: null,
  failureMessage: null,
  restoreStartedAt: null,
  restoreCompletedAt: null
};

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: "session-1",
      workspaceId: "workspace-1",
      agentId: "codex",
      agentName: "Codex",
      permissionMode: "manual",
      acpSessionId: "acp-session-1",
      externalSessionId: "acp-session-1",
      status: "idle",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z"
    },
    workspace: {
      id: "workspace-1",
      name: "Workspace",
      path: "workspace",
      createdAt: "2026-04-29T00:00:00.000Z"
    },
    configOptions: [
      {
        id: "model_fallback",
        name: "Fallback",
        type: "select",
        currentValue: "fallback",
        options: [{ value: "fallback", name: "Fallback model" }]
      },
      {
        id: "agent_model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "pro",
        options: [
          {
            name: "Fast",
            options: [{ value: "fast", name: "Fast model", description: "Lower latency" }]
          },
          { value: "pro", name: "Pro model" }
        ]
      }
    ],
    currentModel: { configId: "agent_model", value: "pro", name: "Pro model" },
    messages: [],
    reviewArtifacts: [],
    timeline: [],
    pendingPermission: null,
    pendingPermissions: [],
    pendingApprovalCount: 0,
    queuedApprovalCount: 0,
    failureMessage: null,
    continuity,
    continuable: true,
    viewOnlyReason: null,
    ...overrides
  };
}

function connection(state: string): ConnectionStatus {
  return { state, message: state === "ready" ? null : "Unavailable" };
}

describe("session config helpers", () => {
  test("extracts model option by category and flattens grouped select values", () => {
    const option = modelConfigOption(detail().configOptions);
    expect(option?.id).toBe("agent_model");
    expect(selectValues(option).map((value) => value.value)).toEqual(["fast", "pro"]);
  });

  test("reports model switching disabled states", () => {
    expect(modelSwitchDisabledReason(detail(), connection("ready"))).toBeNull();
    expect(modelSwitchDisabledReason(detail({ session: { ...detail().session, status: "running" } }), connection("ready"))).toContain("running");
    expect(
      modelSwitchDisabledReason(
        detail({
          pendingPermission: {
            id: "permission-1",
            sessionId: "session-1",
            acpSessionId: "acp-session-1",
            title: "Approve",
            kind: "execute",
            status: "pending",
            toolCall: {},
            options: [],
            createdAt: "2026-04-29T00:00:00.000Z"
          }
        }),
        connection("ready")
      )
    ).toContain("approval");
    expect(
      modelSwitchDisabledReason(detail({ continuable: false, viewOnlyReason: "Restore first" }), connection("ready"))
    ).toBe("Restore first");
    expect(modelSwitchDisabledReason(detail(), connection("failed"))).toBe("Unavailable");
  });

  test("applies config realtime updates to current session and session list only", () => {
    const current = detail();
    const event = {
      type: "session_config_updated" as const,
      sessionId: "session-1",
      configOptions: [
        {
          id: "agent_model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "fast",
          options: [{ value: "fast", name: "Fast model" }]
        }
      ],
      currentModel: { configId: "agent_model", value: "fast", name: "Fast model" }
    };

    const next = applyRealtimeEvent(
      { currentSession: current, inbox: [], liveAssistant: "", error: null },
      event
    );
    expect(next.currentSession?.currentModel?.value).toBe("fast");

    const list = applySessionListRealtime([sessionDetailToListItem(current)], event, current);
    expect(list[0].currentModel?.name).toBe("Fast model");
    expect(list[0].session.status).toBe("idle");
    expect(list[0].continuity.state).toBe("live");
  });

  test("keeps Claude mode config as a session control without changing local permission state", () => {
    const current = detail({
      session: {
        ...detail().session,
        agentId: "claude",
        agentName: "Claude",
        permissionMode: "yolo"
      },
      configOptions: [
        {
          id: "mode",
          name: "Mode",
          type: "select",
          currentValue: "default",
          options: [
            { value: "default", name: "Default" },
            { value: "bypassPermissions", name: "Bypass permissions" }
          ]
        }
      ]
    });

    expect(sessionConfigSelectOptions(current.configOptions).map((option) => option.id)).toEqual(["mode"]);

    const next = applyRealtimeEvent(
      {
        currentSession: current,
        inbox: [],
        liveAssistant: "",
        error: null
      },
      {
        type: "session_config_updated",
        sessionId: "session-1",
        configOptions: [
          {
            id: "mode",
            name: "Mode",
            type: "select",
            currentValue: "bypassPermissions",
            options: [
              { value: "default", name: "Default" },
              { value: "bypassPermissions", name: "Bypass permissions" }
            ]
          }
        ],
        currentModel: null
      }
    );

    expect(next.currentSession?.session.permissionMode).toBe("yolo");
    expect(next.currentSession?.configOptions?.[0]?.currentValue).toBe("bypassPermissions");
  });
});
