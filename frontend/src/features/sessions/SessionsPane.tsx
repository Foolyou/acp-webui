import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "react-aria-components";
import {
  filterCockpitSessions,
  pendingApprovalSessionCount,
  sessionStatusFilterOptions,
  type SessionStatusFilter
} from "../../app/sessionCockpit";
import { isAvailableWorkspaceAgent } from "../../app/workspaceAgentNavigation";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, SessionListItem, Workspace } from "../../types";
import { formatRelativeTime } from "../../utils/format";
import { isYoloSession, permissionModeClass, permissionModeLabel } from "../../utils/permissionMode";
import { sessionStatusLabel } from "../../utils/sessionStatus";

export function SessionsPane({
  agents,
  loading,
  onSelectAgent,
  selectedAgentId,
  sessions,
  workspace
}: {
  agents: AgentRuntimeStatus[];
  loading: boolean;
  onSelectAgent?: (agentId: string | null) => void;
  selectedAgentId?: string | null;
  sessions: SessionListItem[];
  workspace: Workspace | null;
}) {
  const [statusFilter, setStatusFilter] = useState<SessionStatusFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string | null>(selectedAgentId ?? null);
  useEffect(() => {
    setAgentFilter(selectedAgentId ?? null);
  }, [selectedAgentId]);
  const cockpitSessions = useMemo(
    () => filterCockpitSessions(sessions, statusFilter, agentFilter),
    [agentFilter, sessions, statusFilter]
  );
  const pendingCount = pendingApprovalSessionCount(sessions);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

  return (
    <section className="page-surface">
      <div className="section-head">
        <PageHeader eyebrow="Sessions" title={workspace?.name ?? "Sessions"} />
        <div className="section-actions">
          <span className="badge">{loading ? "Loading" : `${cockpitSessions.length} of ${sessions.length} sessions`}</span>
          {pendingCount ? (
            <Button className="secondary small pending-shortcut" onPress={() => setStatusFilter("pending_approval")}>
              {pendingCount} pending approval
            </Button>
          ) : null}
          {workspace ? (
            <Link
              className="primary small"
              params={{ workspaceId: workspace.id }}
              to="/workspaces/$workspaceId/sessions/new"
            >
              New session
            </Link>
          ) : null}
        </div>
      </div>
      <CockpitFilters
        agents={agents}
        agentFilter={agentFilter}
        onSelectAgent={(agentId) => {
          setAgentFilter(agentId);
          onSelectAgent?.(agentId);
        }}
        onSelectStatus={setStatusFilter}
        statusFilter={statusFilter}
      />
      {sessions.length === 0 ? (
        <p className="empty">{emptySessionsText(selectedAgent?.title)}</p>
      ) : cockpitSessions.length === 0 ? (
        <p className="empty">No sessions match these filters.</p>
      ) : (
        <div className="item-list">
          {cockpitSessions.map((item) => (
            <SessionListRow item={item} key={item.session.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function emptySessionsText(selectedAgentTitle?: string) {
  if (!selectedAgentTitle) return "No sessions yet.";
  return `No sessions for ${selectedAgentTitle} in this workspace.`;
}

function CockpitFilters({
  agents,
  agentFilter,
  onSelectAgent,
  onSelectStatus,
  statusFilter
}: {
  agents: AgentRuntimeStatus[];
  agentFilter: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onSelectStatus: (statusFilter: SessionStatusFilter) => void;
  statusFilter: SessionStatusFilter;
}) {
  return (
    <div className="cockpit-filters">
      <label className="agent-session-switcher">
        <span>Status</span>
        <select
          aria-label="Status filter"
          onChange={(event) => onSelectStatus(event.target.value as SessionStatusFilter)}
          value={statusFilter}
        >
          {sessionStatusFilterOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="agent-session-switcher">
        <span>Agent</span>
        <select
          aria-label="Agent filter"
          onChange={(event) => {
            const agentId = event.target.value || null;
            if (!agentId) {
              onSelectAgent(null);
              return;
            }
            const nextAgent = agents.find((agent) => agent.id === agentId);
            if (!nextAgent || !isAvailableWorkspaceAgent(nextAgent) || agentId === agentFilter) return;
            onSelectAgent(agentId);
          }}
          value={agentFilter ?? ""}
        >
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option disabled={!isAvailableWorkspaceAgent(agent)} key={agent.id} value={agent.id}>
              {agent.title}
              {isAvailableWorkspaceAgent(agent) ? "" : " (unavailable)"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SessionListRow({ item }: { item: SessionListItem }) {
  const title = sessionRowTitle(item);
  const nativeMetadata = sessionNativeMetadata(item);
  const activeState = sessionActiveState(item);

  return (
    <Link
      className={`list-item session-card ${item.pendingPermission ? "needs-approval" : ""}`}
      params={{ workspaceId: item.workspace.id, sessionId: item.session.id }}
      to="/workspaces/$workspaceId/sessions/$sessionId"
    >
      <span className="session-card-head">
        <strong className="item-title">{title}</strong>
        {activeState ? <strong className={`active-state-badge ${activeState.className}`}>{activeState.label}</strong> : null}
      </span>
      <span className="session-card-meta">
        <strong>{item.session.agentName}</strong>
        <span>{permissionModeLabel(item.session.permissionMode)}</span>
        <span>{sessionStatusLabel(item.session.status)}</span>
        <span>{formatRelativeTime(item.lastActivityAt)}</span>
        <span className="visually-hidden"> {item.session.status}</span>
      </span>
      {nativeMetadata ? <span className="model-summary">{nativeMetadata}</span> : null}
      {item.currentModel ? (
        <span className="model-summary">Model: {item.currentModel.name ?? item.currentModel.value}</span>
      ) : null}
      {item.launchControlSummary?.length ? (
        <span className="model-summary">{item.launchControlSummary.map((item) => item.valueLabel).join(" / ")}</span>
      ) : null}
      <span className="session-badges">
        <strong className={`permission-mode-badge ${permissionModeClass(item.session.permissionMode)}`}>
          {permissionModeLabel(item.session.permissionMode)}
        </strong>
        {isYoloSession(item.session) ? <strong className="permission-mode-warning">No approvals / no sandbox</strong> : null}
        <ContinuityBadge item={item} />
        {item.queuedPromptCount ? <strong>{item.queuedPromptCount} queued</strong> : null}
        {item.pendingPermission ? (
          <strong className="pending-approval-badge">
            Approval: {item.pendingPermission.title}
            {item.queuedApprovalCount ? ` (${item.queuedApprovalCount} queued)` : ""}
          </strong>
        ) : null}
        {item.hasReviewArtifacts ? <strong>{item.reviewArtifactCount} review items</strong> : null}
      </span>
    </Link>
  );
}

function sessionActiveState(item: SessionListItem) {
  if (item.pendingPermission || item.session.status === "waiting_approval") {
    return { className: "waiting-approval", label: "Waiting approval" };
  }
  if (item.session.status === "stopping" || item.activeTurn?.status === "stopping") {
    return { className: "stopping", label: "Stopping" };
  }
  if (item.session.status === "running" || item.activeTurn?.status === "running") {
    return { className: "running", label: "Running" };
  }
  return null;
}

function cleanTitle(value?: string | null) {
  const title = value?.trim();
  return title || null;
}

function sessionRowTitle(item: SessionListItem) {
  const fallbackSubject = cleanTitle(item.session.agentName) ?? cleanTitle(item.session.id);
  return cleanTitle(item.session.title) ?? cleanTitle(item.session.nativeTitle) ?? (fallbackSubject ? `${fallbackSubject} session` : "Session");
}

function sessionNativeMetadata(item: SessionListItem) {
  const metadata: string[] = [];
  const localTitle = cleanTitle(item.session.title);
  const nativeTitle = cleanTitle(item.session.nativeTitle);
  if (nativeTitle && localTitle && nativeTitle !== localTitle) {
    metadata.push(`Native: ${nativeTitle}`);
  }
  if (item.session.nativeUpdatedAt) {
    metadata.push(`Native updated ${formatRelativeTime(item.session.nativeUpdatedAt)}`);
  }
  return metadata.join(" · ");
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
