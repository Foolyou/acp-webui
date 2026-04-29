import { Link } from "@tanstack/react-router";
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
  onCreate: (agentId: string, permissionMode: PermissionModeId) => void;
  sessions: SessionListItem[];
  workspace: Workspace | null;
}) {
  return (
    <section className="page-surface">
      <div className="section-head">
        <PageHeader eyebrow="Sessions" title={workspace?.name ?? "Sessions"} />
        <div className="section-actions">
          <span className="muted">{loading ? "Loading" : sessions.length}</span>
          <AgentCreateControls agents={agents} onCreate={onCreate} size="small" />
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="empty-panel">
          <p className="empty">No sessions yet.</p>
          <AgentCreateControls agents={agents} onCreate={onCreate} />
        </div>
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
  onCreate: (agentId: string, permissionMode: PermissionModeId) => void;
  size?: "small";
}) {
  return (
    <div className={`agent-create-controls ${size ?? ""}`}>
      {agents.map((agent) => {
        const modes = fallbackPermissionModes(agent);
        return (
          <div className={`agent-option-group ${size ?? ""}`} key={agent.id}>
            <div className="agent-option-summary">
              <strong>{agent.title}</strong>
              <span>{agentStatusText(agent)}</span>
            </div>
            <div className="permission-mode-options" role="group" aria-label={`${agent.title} permission modes`}>
              {modes.map((mode) => {
                const available =
                  agent.enabled && mode.status.state !== "starting" && mode.status.state !== "disabled";
                return (
                  <Button
                    className={`permission-mode-option ${mode.status.state} ${permissionModeClass(mode.id)}`}
                    isDisabled={!available}
                    key={mode.id}
                    onPress={() => onCreate(agent.id, mode.id)}
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
