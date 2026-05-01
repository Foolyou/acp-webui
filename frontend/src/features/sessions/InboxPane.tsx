import { useNavigate } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { PageHeader } from "../../components/common";
import type { InboxItem } from "../../types";
import { sessionStatusLabel } from "../../utils/sessionStatus";

export function InboxPane({ inbox, onOpen }: { inbox: InboxItem[]; onOpen: (sessionId: string) => void }) {
  const navigate = useNavigate();
  return (
    <section className="page-surface">
      <PageHeader eyebrow="Inbox" title="Needs approval" />
      {inbox.length === 0 ? (
        <p className="empty">No approvals waiting.</p>
      ) : (
        <div className="item-list">
          {inbox.map((item) => (
            <Button
              className="list-item"
              key={item.session.id}
              onPress={() => {
                void onOpen(item.session.id);
                void navigate({
                  to: "/workspaces/$workspaceId/sessions/$sessionId",
                  params: { workspaceId: item.workspace.id, sessionId: item.session.id }
                });
              }}
            >
              <span className="item-title">{item.permission.title}</span>
              <span>
                {item.workspace.name} · {item.session.agentName} · {sessionStatusLabel(item.session.status)}
              </span>
              <small>
                {item.permission.kind}
                {item.queuedApprovalCount ? ` · ${item.queuedApprovalCount} queued` : ""}
              </small>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
