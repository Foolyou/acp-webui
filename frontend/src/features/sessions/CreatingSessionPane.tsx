import { Button } from "react-aria-components";
import { PageHeader } from "../../components/common";
import type { Workspace } from "../../types";

export function CreatingSessionPane({
  creating,
  onRetry,
  workspace
}: {
  creating: boolean;
  onRetry: () => void;
  workspace: Workspace | null;
}) {
  return (
    <section className="session-layout">
      <PageHeader eyebrow="New Session" title={workspace?.name ?? "Starting Codex"} />
      <div className="timeline">
        <div className="message assistant live">
          <div className="message-role">codex</div>
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="message-content">Starting Codex...</div>
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
