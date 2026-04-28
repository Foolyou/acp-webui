import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { PageHeader } from "../../components/common";
import type { SessionListItem, Workspace } from "../../types";
import { formatRelativeTime } from "../../utils/format";

export function SessionsPane({
  loading,
  onCreate,
  sessions,
  workspace
}: {
  loading: boolean;
  onCreate: () => void;
  sessions: SessionListItem[];
  workspace: Workspace | null;
}) {
  return (
    <section className="page-surface">
      <div className="section-head">
        <PageHeader eyebrow="Sessions" title={workspace?.name ?? "Sessions"} />
        <div className="section-actions">
          <span className="muted">{loading ? "Loading" : sessions.length}</span>
          <Button className="primary small" onPress={onCreate}>
            New Session
          </Button>
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="empty-panel">
          <p className="empty">No sessions yet.</p>
          <Button className="primary" onPress={onCreate}>
            Start Session
          </Button>
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
        {!item.continuable ? <strong>View only</strong> : null}
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
