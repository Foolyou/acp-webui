import { Button } from "react-aria-components";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, Workspace } from "../../types";

export function CreatingSessionPane({
  agent,
  creating,
  onRetry,
  workspace
}: {
  agent: AgentRuntimeStatus | null;
  creating: boolean;
  onRetry: () => void;
  workspace: Workspace | null;
}) {
  const agentName = agent?.title ?? "Agent";
  return (
    <section className="session-layout">
      <PageHeader eyebrow="New Session" title={workspace?.name ?? `Starting ${agentName}`} />
      <div className="timeline">
        <div className="message assistant live">
          <div className="message-role">{agentName}</div>
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="message-content">Starting {agentName}...</div>
        </div>
      </div>
      {!creating ? (
        <div className="composer-status error">
          Session creation did not complete.
          <Button className="secondary small" onPress={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}
