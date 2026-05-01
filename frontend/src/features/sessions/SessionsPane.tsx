import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "react-aria-components";
import {
  normalizeLaunchControlValues,
  readLastSessionProfile,
  resolveLastSessionProfile,
  writeLastSessionProfile
} from "../../app/lastSessionProfile";
import { PageHeader } from "../../components/common";
import type { AgentPermissionModeStatus, AgentRuntimeStatus, PermissionModeId, SessionListItem, Workspace } from "../../types";
import { formatRelativeTime } from "../../utils/format";
import {
  fallbackPermissionModes,
  isYoloSession,
  permissionModeClass,
  permissionModeLabel
} from "../../utils/permissionMode";
import { sessionStatusLabel } from "../../utils/sessionStatus";

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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedModeId, setSelectedModeId] = useState<PermissionModeId | null>(null);
  const [controlValues, setControlValues] = useState<Record<string, Record<string, string>>>({});
  const [lastProfile] = useState(() => readLastSessionProfile());
  const resolvedLastProfile = useMemo(() => resolveLastSessionProfile(agents, lastProfile), [agents, lastProfile]);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

  function selectedValues(agent: AgentRuntimeStatus) {
    const agentValues = controlValues[agent.id] ?? {};
    const values: Record<string, string> = {};
    for (const control of agent.launchControls ?? []) {
      values[control.id] = agentValues[control.id] ?? control.defaultValue;
    }
    return values;
  }

  function selectAgent(agent: AgentRuntimeStatus) {
    const modes = fallbackPermissionModes(agent);
    const firstAvailable = modes.find((mode) => canLaunch(agent, mode));
    setSelectedAgentId(agent.id);
    setSelectedModeId(firstAvailable?.id ?? modes[0]?.id ?? null);
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
        {agents.map((agent) => (
          <Button
            className={`agent-choice ${selectedAgentId === agent.id ? "selected" : ""} ${agent.status.state}`}
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
          selectedModeId={selectedModeId}
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
  const selectedLaunchable = selectedMode ? canLaunch(agent, selectedMode) : false;

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
          disabled={!agent.enabled || !modes.some((mode) => canLaunch(agent, mode))}
          onChange={(event) => onSelectMode(event.target.value as PermissionModeId)}
          value={selectedMode?.id ?? ""}
        >
          {modes.map((mode) => (
            <option disabled={!canLaunch(agent, mode)} key={mode.id} value={mode.id}>
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

function canLaunch(agent: AgentRuntimeStatus, mode: AgentPermissionModeStatus) {
  return agent.enabled && mode.status.state !== "starting" && mode.status.state !== "disabled";
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
        {item.session.agentName} · {sessionStatusLabel(item.session.status)} · {formatRelativeTime(item.lastActivityAt)}
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
