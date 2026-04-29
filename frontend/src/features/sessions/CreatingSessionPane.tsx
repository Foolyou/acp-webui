import { Button } from "react-aria-components";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, PermissionModeId, Workspace } from "../../types";
import { fallbackPermissionModes, permissionModeClass, permissionModeLabel } from "../../utils/permissionMode";

export function CreatingSessionPane({
  agent,
  creating,
  permissionMode,
  onRetry,
  workspace
}: {
  agent: AgentRuntimeStatus | null;
  creating: boolean;
  permissionMode: PermissionModeId | null;
  onRetry: () => void;
  workspace: Workspace | null;
}) {
  const agentName = agent?.title ?? "Agent";
  const modes = agent ? fallbackPermissionModes(agent) : [];
  const mode = permissionMode ?? "manual";
  const modeLabel = permissionModeLabel(mode, modes);
  return (
    <section className="session-layout">
      <PageHeader eyebrow="New Session" title={workspace?.name ?? `Starting ${agentName}`} />
      <div className="timeline">
        <div className="message assistant live">
          <div className="message-role">{agentName}</div>
          <span className={`permission-mode-badge ${permissionModeClass(mode)}`}>{modeLabel}</span>
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
