import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "react-aria-components";
import {
  normalizeLaunchControlValues,
  readLastSessionProfile,
  resolveLastSessionProfile,
  writeLastSessionProfile
} from "../../app/lastSessionProfile";
import { isAvailableWorkspaceAgent } from "../../app/workspaceAgentNavigation";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, PermissionModeId, SessionListItem, Workspace } from "../../types";
import { formatRelativeTime } from "../../utils/format";
import {
  fallbackPermissionModes,
  isYoloSession,
  permissionModeClass,
  permissionModeLabel
} from "../../utils/permissionMode";
import { sessionStatusLabel } from "../../utils/sessionStatus";
import { canLaunchPermissionMode, resolveActiveCreateModeId } from "./sessionCreateMode";

export function SessionsPane({
  agents,
  loading,
  onCreate,
  onSelectAgent,
  selectedAgentId,
  sessions,
  workspace
}: {
  agents: AgentRuntimeStatus[];
  loading: boolean;
  onCreate: (agentId: string, permissionMode: PermissionModeId, launchControlValues?: Record<string, string>) => void;
  onSelectAgent?: (agentId: string) => void;
  selectedAgentId?: string | null;
  sessions: SessionListItem[];
  workspace: Workspace | null;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const showCreate = sessions.length === 0 || createOpen;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

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
      {onSelectAgent ? (
        <AgentSessionSwitcher agents={agents} onSelectAgent={onSelectAgent} selectedAgentId={selectedAgentId ?? null} />
      ) : null}
      {showCreate ? (
        <div className={`session-create-panel ${sessions.length > 0 ? "compact" : ""}`}>
          {sessions.length === 0 ? <p className="empty">{emptySessionsText(selectedAgent?.title)}</p> : null}
          <AgentCreateControls
            agents={agents}
            onCreate={onCreate}
            scopedAgentId={selectedAgentId ?? null}
            size={sessions.length > 0 ? "small" : undefined}
          />
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

function emptySessionsText(selectedAgentTitle?: string) {
  if (!selectedAgentTitle) return "No sessions yet.";
  return `No sessions for ${selectedAgentTitle} in this workspace.`;
}

function AgentSessionSwitcher({
  agents,
  onSelectAgent,
  selectedAgentId
}: {
  agents: AgentRuntimeStatus[];
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
}) {
  if (!agents.length) return null;

  return (
    <label className="agent-session-switcher">
      <span>Agent</span>
      <select
        aria-label="Selected agent"
        onChange={(event) => {
          const agentId = event.target.value;
          const nextAgent = agents.find((agent) => agent.id === agentId);
          if (!nextAgent || !isAvailableWorkspaceAgent(nextAgent) || agentId === selectedAgentId) return;
          onSelectAgent(agentId);
        }}
        value={selectedAgentId ?? ""}
      >
        {!selectedAgentId ? <option value="">Select agent</option> : null}
        {agents.map((agent) => (
          <option disabled={!isAvailableWorkspaceAgent(agent)} key={agent.id} value={agent.id}>
            {agent.title}
            {isAvailableWorkspaceAgent(agent) ? "" : " (unavailable)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function AgentCreateControls({
  agents,
  onCreate,
  scopedAgentId,
  size
}: {
  agents: AgentRuntimeStatus[];
  onCreate: (agentId: string, permissionMode: PermissionModeId, launchControlValues?: Record<string, string>) => void;
  scopedAgentId?: string | null;
  size?: "small";
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(scopedAgentId ?? null);
  const [selectedModeId, setSelectedModeId] = useState<PermissionModeId | null>(null);
  const [controlValues, setControlValues] = useState<Record<string, Record<string, string>>>({});
  const [lastProfile] = useState(() => readLastSessionProfile());
  const createAgents = useMemo(
    () => (scopedAgentId ? agents.filter((agent) => agent.id === scopedAgentId) : agents),
    [agents, scopedAgentId]
  );
  const resolvedLastProfile = useMemo(() => {
    const profile = resolveLastSessionProfile(createAgents, lastProfile);
    if (scopedAgentId && profile?.agent.id !== scopedAgentId) return null;
    return profile;
  }, [createAgents, lastProfile, scopedAgentId]);
  const activeAgentId = scopedAgentId ?? selectedAgentId;
  const selectedAgent = createAgents.find((agent) => agent.id === activeAgentId) ?? null;
  const activeModeId = resolveActiveCreateModeId(selectedAgent, selectedModeId);

  function selectedValues(agent: AgentRuntimeStatus) {
    return normalizeLaunchControlValues(agent, controlValues[agent.id] ?? {});
  }

  function selectAgent(agent: AgentRuntimeStatus) {
    setSelectedAgentId(agent.id);
    setSelectedModeId(resolveActiveCreateModeId(agent, null));
    setControlValues((current) => ({
      ...current,
      [agent.id]: {
        ...normalizeLaunchControlValues(agent, current[agent.id] ?? {})
      }
    }));
  }

  function createWithProfile(agent: AgentRuntimeStatus, permissionMode: PermissionModeId, values: Record<string, string>) {
    const launchControlValues = { ...normalizeLaunchControlValues(agent, values), permission: permissionMode };
    writeLastSessionProfile({ agentId: agent.id, permissionMode, launchControlValues });
    onCreate(agent.id, permissionMode, launchControlValues);
  }

  return (
    <div className={`agent-create-flow ${size ?? ""}`}>
      <div className={`agent-create-controls ${size ?? ""}`}>
        {resolvedLastProfile ? (
          <Button
            className="agent-choice last-profile"
            onPress={() =>
              createWithProfile(
                resolvedLastProfile.agent,
                resolvedLastProfile.permissionMode,
                resolvedLastProfile.launchControlValues
              )
            }
          >
            <strong>Last profile</strong>
            <span>
              {resolvedLastProfile.agent.title} / {resolvedLastProfile.modeLabel}
            </span>
          </Button>
        ) : null}
        {createAgents.map((agent) => (
          <Button
            className={`agent-choice ${activeAgentId === agent.id ? "selected" : ""} ${agent.status.state}`}
            key={agent.id}
            onPress={() => selectAgent(agent)}
          >
            <strong>{agent.title}</strong>
            <span>{agentStatusText(agent)}</span>
          </Button>
        ))}
      </div>
      {selectedAgent ? (
        <AgentCreateDetail
          agent={selectedAgent}
          controlValues={selectedValues(selectedAgent)}
          onChangeControl={(controlId, value) =>
            setControlValues((current) => ({
              ...current,
              [selectedAgent.id]: {
                ...(current[selectedAgent.id] ?? {}),
                [controlId]: value
              }
            }))
          }
          onConfirm={(permissionMode) => createWithProfile(selectedAgent, permissionMode, selectedValues(selectedAgent))}
          onSelectMode={setSelectedModeId}
          selectedModeId={activeModeId}
        />
      ) : null}
    </div>
  );
}

function AgentCreateDetail({
  agent,
  controlValues,
  onChangeControl,
  onConfirm,
  onSelectMode,
  selectedModeId
}: {
  agent: AgentRuntimeStatus;
  controlValues: Record<string, string>;
  onChangeControl: (controlId: string, value: string) => void;
  onConfirm: (permissionMode: PermissionModeId) => void;
  onSelectMode: (permissionMode: PermissionModeId) => void;
  selectedModeId: PermissionModeId | null;
}) {
  const modes = fallbackPermissionModes(agent);
  const controls = (agent.launchControls ?? []).filter((control) => control.id !== "permission");
  const selectedMode = modes.find((mode) => mode.id === selectedModeId) ?? modes[0] ?? null;
  const selectedLaunchable = selectedMode ? canLaunchPermissionMode(agent, selectedMode) : false;

  return (
    <div className={`agent-create-detail ${agent.status.state}`}>
      <div className="agent-create-detail-head">
        <div>
          <strong>{agent.title}</strong>
          <span>{agentStatusText(agent)}</span>
        </div>
        <span className={`badge ${agent.status.state}`}>{agent.status.state}</span>
      </div>
      {agent.status.message ? <p className="muted">{agent.status.message}</p> : null}
      {controls.length ? (
        <div className="launch-control-options">
          {controls.map((control) => (
            <label key={control.id} title={control.description ?? control.label}>
              <span>{control.label}</span>
              <select
                disabled={!agent.enabled}
                onChange={(event) => onChangeControl(control.id, event.target.value)}
                value={controlValues[control.id] ?? control.defaultValue}
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
      <label className="permission-mode-select-field">
        <span>Permission mode</span>
        <select
          disabled={!agent.enabled || !modes.some((mode) => canLaunchPermissionMode(agent, mode))}
          onChange={(event) => onSelectMode(event.target.value as PermissionModeId)}
          value={selectedMode?.id ?? ""}
        >
          {modes.map((mode) => (
            <option disabled={!canLaunchPermissionMode(agent, mode)} key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <Button className="primary" isDisabled={!selectedMode || !selectedLaunchable} onPress={() => selectedMode && onConfirm(selectedMode.id)}>
        Create session
      </Button>
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
  const title = sessionRowTitle(item);
  const nativeMetadata = sessionNativeMetadata(item);

  return (
    <Link
      className="list-item session-row"
      params={{ workspaceId: item.workspace.id, agentId: item.session.agentId, sessionId: item.session.id }}
      to="/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId"
    >
      <span className="item-title">{title}</span>
      <span>
        {item.session.agentName} · {sessionStatusLabel(item.session.status)} · {formatRelativeTime(item.lastActivityAt)}
        <span className="visually-hidden"> {item.session.status}</span>
      </span>
      {nativeMetadata ? <span className="model-summary">{nativeMetadata}</span> : null}
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
