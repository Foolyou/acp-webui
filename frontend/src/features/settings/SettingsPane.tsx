import { PageHeader } from "../../components/common";
import type { AccessObservability, AgentRuntimeStatus } from "../../types";
import { AgentsStatusPane } from "../agents/AgentsStatusPane";

type SettingsPaneProps = {
  access: AccessObservability | null;
  agents: AgentRuntimeStatus[];
  inboxCount: number;
  sessionsCount: number;
  socketState: string;
  transcriptionAvailable: boolean;
  workspacesCount: number;
};

export function SettingsPane({
  access,
  agents,
  inboxCount,
  sessionsCount,
  socketState,
  transcriptionAvailable,
  workspacesCount
}: SettingsPaneProps) {
  return (
    <div className="page-surface settings-page">
      <PageHeader eyebrow="Settings" title="Controller settings" />
      <section className="settings-section" aria-labelledby="settings-access">
        <div className="section-head">
          <h2 id="settings-access">Access</h2>
          <span className={`badge ${access?.exposureMode ?? "unknown"}`}>{formatExposureMode(access?.exposureMode)}</span>
        </div>
        {access ? (
          <dl className="settings-data-grid">
            <SettingData label="Bind host" value={access.bindHost} />
            <SettingData label="Port" value={String(access.bindPort)} />
            <SettingData label="Access URL" value={access.accessUrl} />
            <SettingData label="Auth status" value={formatAuthStatus(access.auth.access)} />
            <SettingData label="Exposure mode" value={formatExposureMode(access.exposureMode)} />
            <SettingData label="Tailscale Serve URL" value={access.tailscaleServeUrl ?? "Unavailable"} />
          </dl>
        ) : (
          <div className="empty-panel">
            <p className="empty">Access data unavailable.</p>
          </div>
        )}
      </section>
      <AgentsStatusPane agents={agents} socketState={socketState} surface="section" />
      <section className="settings-section" aria-labelledby="settings-storage">
        <div className="section-head">
          <h2 id="settings-storage">Storage</h2>
        </div>
        <dl className="settings-data-grid compact">
          <SettingData label="Workspaces" value={String(workspacesCount)} />
          <SettingData label="Loaded sessions" value={String(sessionsCount)} />
          <SettingData label="Inbox items" value={String(inboxCount)} />
        </dl>
      </section>
      <section className="settings-section" aria-labelledby="settings-diagnostics">
        <div className="section-head">
          <h2 id="settings-diagnostics">Diagnostics</h2>
          <span className={`badge ${socketState}`}>{socketState}</span>
        </div>
        <dl className="settings-data-grid compact">
          <SettingData label="Realtime socket" value={socketState} />
          <SettingData label="Audio transcription" value={transcriptionAvailable ? "Available" : "Unavailable"} />
          <SettingData label="Configured agents" value={String(agents.length)} />
        </dl>
      </section>
    </div>
  );
}

function SettingData({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-data-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatAuthStatus(value?: string) {
  switch (value) {
    case "auth_disabled":
      return "Auth disabled";
    case "approved_device":
      return "Approved device";
    case "anonymous":
      return "Pairing required";
    default:
      return value ?? "Unknown";
  }
}

function formatExposureMode(value?: string) {
  switch (value) {
    case "loopback":
      return "Loopback";
    case "tailscale_bind":
      return "Tailscale bind";
    case "tailscale_serve":
      return "Tailscale Serve";
    case "loopback_proxy":
      return "Loopback proxy";
    case "network_bind":
      return "Network bind";
    default:
      return "Unknown";
  }
}
