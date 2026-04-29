import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, SessionListItem, Workspace } from "../../types";
import { formatRelativeTime } from "../../utils/format";

export function SessionsPane({
  agents,
  loading,
  onCreate,
  sessions,
  workspace
}: {
  agents: AgentRuntimeStatus[];
  loading: boolean;
  onCreate: (agentId: string) => void;
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
  onCreate: (agentId: string) => void;
  size?: "small";
}) {
  return (
    <div className={`agent-create-controls ${size ?? ""}`}>
      {agents.map((agent) => {
        const available = agent.enabled && agent.status.state !== "starting" && agent.status.state !== "disabled";
        return (
          <Button
            className={`agent-option ${agent.status.state}`}
            isDisabled={!available}
            key={agent.id}
            onPress={() => onCreate(agent.id)}
          >
            <strong>{agent.title}</strong>
            <span>{agentStatusText(agent)}</span>
          </Button>
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
      <span className="item-path">{item.workspace.path}</span>
      <span className="session-badges">
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
