import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus } from "../../types";
import { fallbackPermissionModes, permissionModeClass } from "../../utils/permissionMode";

export function AgentsStatusPane({ agents, socketState }: { agents: AgentRuntimeStatus[]; socketState: string }) {
  return (
    <section className="page-surface">
      <div className="section-head">
        <PageHeader eyebrow="Agents" title="Agent status" />
        <span className={`badge ${socketState}`}>{socketState}</span>
      </div>
      {agents.length ? (
        <div className="agent-status-list">
          {agents.map((agent) => (
            <AgentStatusCard agent={agent} key={agent.id} />
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <p className="empty">No agents configured.</p>
        </div>
      )}
    </section>
  );
}

function AgentStatusCard({ agent }: { agent: AgentRuntimeStatus }) {
  const modes = fallbackPermissionModes(agent);
  return (
    <article className={`agent-status-card ${agent.status.state}`}>
      <div className="agent-status-head">
        <div>
          <strong>{agent.title}</strong>
          <span>{agent.enabled ? "Enabled" : "Disabled"}</span>
        </div>
        <span className={`badge ${agent.status.state}`}>{agent.status.state}</span>
      </div>
      {agent.status.message ? <p className="muted">{agent.status.message}</p> : null}
      {agent.launchControls?.length ? (
        <div className="agent-status-section">
          <span className="eyebrow">Launch controls</span>
          <div className="status-chip-row">
            {agent.launchControls.map((control) => (
              <span className="status-chip" key={control.id}>
                {control.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="agent-status-section">
        <span className="eyebrow">Permission modes</span>
        <div className="permission-status-grid">
          {modes.map((mode) => (
            <div className={`permission-status ${permissionModeClass(mode.id)} ${mode.status.state}`} key={mode.id}>
              <strong>{mode.label}</strong>
              <span>{mode.status.message ?? mode.status.state}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
