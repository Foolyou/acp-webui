import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsPane } from "./SettingsPane";
import type { AccessObservability, AgentRuntimeStatus } from "../../types";

function access(overrides: Partial<AccessObservability> = {}): AccessObservability {
  return {
    bindHost: "127.0.0.1",
    bindPort: 7635,
    accessUrl: "http://127.0.0.1:7635/",
    auth: { access: "paired_session", pairingRequired: false, clientIp: "127.0.0.1" },
    exposureMode: "loopback",
    tailscaleServeUrl: null,
    ...overrides
  };
}

function agent(): AgentRuntimeStatus {
  return {
    id: "codex",
    providerId: "codex",
    title: "Codex",
    enabled: true,
    status: { state: "ready", message: null },
    launchControls: [
      {
        id: "reasoning",
        label: "Reasoning",
        category: "model",
        scope: "launch",
        type: "select",
        defaultValue: "low",
        options: [{ value: "low", label: "Low" }]
      }
    ],
    permissionModes: [
      {
        id: "manual",
        label: "Manual",
        description: "Ask before approval-managed actions",
        riskLevel: "low",
        status: { state: "ready", message: "Ready" }
      }
    ]
  };
}

describe("SettingsPane", () => {
  test("renders access, agents, storage, and diagnostics sections", () => {
    const html = renderToStaticMarkup(
      <SettingsPane
        access={access({ tailscaleServeUrl: "https://acp-webui.tailnet.test/", exposureMode: "tailscale_serve" })}
        agents={[agent()]}
        inboxCount={2}
        sessionsCount={3}
        socketState="connected"
        transcriptionAvailable={true}
        workspacesCount={1}
      />
    );

    expect(html).toContain("Access");
    expect(html).toContain("Agents");
    expect(html).toContain("Storage");
    expect(html).toContain("Diagnostics");
    expect(html).toContain("127.0.0.1");
    expect(html).toContain("7635");
    expect(html).toContain("https://acp-webui.tailnet.test/");
    expect(html).toContain("Paired session");
    expect(html).toContain("Tailscale Serve");
    expect(html).toContain("Codex");
    expect(html).toContain("Reasoning");
    expect(html).toContain("Manual");
  });

  test("keeps access settings observational", () => {
    const html = renderToStaticMarkup(
      <SettingsPane
        access={access()}
        agents={[]}
        inboxCount={0}
        sessionsCount={0}
        socketState="disconnected"
        transcriptionAvailable={false}
        workspacesCount={0}
      />
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<select");
  });
});
