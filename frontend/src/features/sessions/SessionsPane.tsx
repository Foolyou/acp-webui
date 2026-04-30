import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "react-aria-components";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, PermissionModeId, SessionListItem, Workspace } from "../../types";
import { formatRelativeTime } from "../../utils/format";
import {
  fallbackPermissionModes,
  isYoloSession,
  permissionModeClass,
  permissionModeLabel
} from "../../utils/permissionMode";

export function SessionsPane({
  agents,
  loading,
  onCreate,
  sessions,
  workspace
}: {
  agents: AgentRuntimeStatus[];
  loading: boolean;
  onCreate: (agentId: string, permissionMode: PermissionModeId, launchControlValues?: Record<string, string>) => void;
  sessions: SessionListItem[];
  workspace: Workspace | null;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const showCreate = sessions.length === 0 || createOpen;

  return (
    <section className="page-surface">
      <div className="section-head">
        <PageHeader eyebrow="Sessions" title={workspace?.name ?? "Sessions"} />
        <div className="section-actions">
          <span className="badge">{loading ? "Loading" : `${sessions.length} sessions`}</span>
          {sessions.length > 0 ? (
            <Button className="primary small" onPress={() => setCreateOpen((open) => !open)}>
              New session
            </Button>
          ) : null}
        </div>
      </div>
      {showCreate ? (
        <div className={`session-create-panel ${sessions.length > 0 ? "compact" : ""}`}>
          {sessions.length === 0 ? <p className="empty">No sessions yet.</p> : null}
          <AgentCreateControls agents={agents} onCreate={onCreate} size={sessions.length > 0 ? "small" : undefined} />
        </div>
      ) : null}
      {sessions.length === 0 ? (
        null
      ) : (
        <div className="item-list">
          {sessions.map((item) => (
            <SessionListRow item={item} key={item.session.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function AgentCreateControls({
  agents,
  onCreate,
  size
}: {
  agents: AgentRuntimeStatus[];
  onCreate: (agentId: string, permissionMode: PermissionModeId, launchControlValues?: Record<string, string>) => void;
  size?: "small";
}) {
  const [controlValues, setControlValues] = useState<Record<string, Record<string, string>>>({});

  function selectedValues(agent: AgentRuntimeStatus) {
    const agentValues = controlValues[agent.id] ?? {};
    const values: Record<string, string> = {};
    for (const control of agent.launchControls ?? []) {
      values[control.id] = agentValues[control.id] ?? control.defaultValue;
    }
    return values;
  }

  return (
    <div className={`agent-create-controls ${size ?? ""}`}>
      {agents.map((agent) => {
        const modes = fallbackPermissionModes(agent);
        const controls = (agent.launchControls ?? []).filter((control) => control.id !== "permission");
        const values = selectedValues(agent);
        return (
          <div className={`agent-option-group ${size ?? ""}`} key={agent.id}>
            <div className="agent-option-summary">
              <strong>{agent.title}</strong>
              <span>{agentStatusText(agent)}</span>
            </div>
            {controls.length ? (
              <div className="launch-control-options">
                {controls.map((control) => (
                  <label key={control.id} title={control.description ?? control.label}>
                    <span>{control.label}</span>
                    <select
                      disabled={!agent.enabled}
                      onChange={(event) =>
                        setControlValues((current) => ({
                          ...current,
                          [agent.id]: {
                            ...(current[agent.id] ?? {}),
                            [control.id]: event.target.value
                          }
                        }))
                      }
                      value={values[control.id]}
                    >
                      {control.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="permission-mode-options" role="group" aria-label={`${agent.title} permission modes`}>
              {modes.map((mode) => {
                const available =
                  agent.enabled && mode.status.state !== "starting" && mode.status.state !== "disabled";
                return (
                  <Button
                    className={`permission-mode-option ${mode.status.state} ${permissionModeClass(mode.id)}`}
                    isDisabled={!available}
                    key={mode.id}
                    onPress={() => onCreate(agent.id, mode.id, { ...values, permission: mode.id })}
                  >
                    <strong>{mode.label}</strong>
                    <span>{mode.description}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function agentStatusText(agent: AgentRuntimeStatus) {
  if (!agent.enabled) return "Disabled";
  if (agent.status.state === "idle") return "Start session";
  if (agent.status.state === "ready") return "New session";
  return agent.status.message ?? agent.status.state;
}

function SessionListRow({ item }: { item: SessionListItem }) {
  return (
    <Link
      className="list-item session-row"
      params={{ workspaceId: item.workspace.id, sessionId: item.session.id }}
      to="/workspaces/$workspaceId/sessions/$sessionId"
    >
      <span className="item-title">{item.workspace.name}</span>
      <span>
        {item.session.agentName} · {item.session.status} · {formatRelativeTime(item.lastActivityAt)}
      </span>
      {item.currentModel ? (
        <span className="model-summary">Model: {item.currentModel.name ?? item.currentModel.value}</span>
      ) : null}
      {item.launchControlSummary?.length ? (
        <span className="model-summary">{item.launchControlSummary.map((item) => item.valueLabel).join(" / ")}</span>
      ) : null}
      <span className="item-path">{item.workspace.path}</span>
      <span className="session-badges">
        {item.session.permissionMode !== "manual" ? (
          <strong className={`permission-mode-badge ${permissionModeClass(item.session.permissionMode)}`}>
            {permissionModeLabel(item.session.permissionMode)}
          </strong>
        ) : null}
        {isYoloSession(item.session) ? <strong className="permission-mode-warning">No approvals / no sandbox</strong> : null}
        <ContinuityBadge item={item} />
        {item.pendingPermission ? (
          <strong>
            Approval: {item.pendingPermission.title}
            {item.queuedApprovalCount ? ` (${item.queuedApprovalCount} queued)` : ""}
          </strong>
        ) : null}
        {item.hasReviewArtifacts ? <strong>{item.reviewArtifactCount} review items</strong> : null}
      </span>
    </Link>
  );
}

function ContinuityBadge({ item }: { item: SessionListItem }) {
  switch (item.continuity.state) {
    case "loadable":
      return <strong>Restorable</strong>;
    case "restoring":
      return <strong>Restoring</strong>;
    case "restored":
      return <strong>Restored</strong>;
    case "restore_failed":
      return <strong>Restore failed</strong>;
    case "resumable":
      return <strong>Resume unavailable</strong>;
    case "view_only":
      return <strong>View only</strong>;
    default:
      return item.continuable ? null : <strong>View only</strong>;
  }
}
