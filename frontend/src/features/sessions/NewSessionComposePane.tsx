import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "react-aria-components";
import {
  normalizeLaunchControlValues,
  readLastWorkspaceSessionProfile,
  resolveLastSessionProfile
} from "../../app/lastSessionProfile";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, PermissionModeId, Workspace } from "../../types";
import { fallbackPermissionModes } from "../../utils/permissionMode";
import { canLaunchPermissionMode, resolveActiveCreateModeId } from "./sessionCreateMode";

type ComposeStep = "entry" | "compose";

export function NewSessionComposePane({
  agents,
  busy,
  onCreate,
  scopedAgentId,
  workspace,
  workspaceId
}: {
  agents: AgentRuntimeStatus[];
  busy: boolean;
  onCreate: (
    agentId: string,
    permissionMode: PermissionModeId,
    launchControlValues: Record<string, string>
  ) => Promise<void>;
  scopedAgentId?: string | null;
  workspace: Workspace | null;
  workspaceId: string;
}) {
  const createAgents = useMemo(
    () => (scopedAgentId ? agents.filter((agent) => agent.id === scopedAgentId) : agents),
    [agents, scopedAgentId]
  );
  const lastProfile = useMemo(() => readLastWorkspaceSessionProfile(workspaceId), [workspaceId]);
  const resolvedLastProfile = useMemo(
    () => resolveLastSessionProfile(createAgents, lastProfile),
    [createAgents, lastProfile]
  );
  const [step, setStep] = useState<ComposeStep>(resolvedLastProfile ? "entry" : "compose");
  const [configExpanded, setConfigExpanded] = useState(!resolvedLastProfile);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    resolvedLastProfile?.agent.id ?? scopedAgentId ?? createAgents[0]?.id ?? null
  );
  const [selectedModeId, setSelectedModeId] = useState<PermissionModeId | null>(
    resolvedLastProfile?.permissionMode ?? null
  );
  const [controlValues, setControlValues] = useState<Record<string, Record<string, string>>>(
    resolvedLastProfile ? { [resolvedLastProfile.agent.id]: resolvedLastProfile.launchControlValues } : {}
  );

  useEffect(() => {
    if (resolvedLastProfile) {
      setStep("entry");
      setConfigExpanded(false);
      setSelectedAgentId(resolvedLastProfile.agent.id);
      setSelectedModeId(resolvedLastProfile.permissionMode);
      setControlValues({ [resolvedLastProfile.agent.id]: resolvedLastProfile.launchControlValues });
      return;
    }
    setStep("compose");
    setConfigExpanded(true);
    setSelectedAgentId(scopedAgentId ?? createAgents[0]?.id ?? null);
    setSelectedModeId(null);
    setControlValues({});
  }, [createAgents, resolvedLastProfile, scopedAgentId]);

  const selectedAgent = createAgents.find((agent) => agent.id === selectedAgentId) ?? null;
  const activeModeId = resolveActiveCreateModeId(selectedAgent, selectedModeId);
  const modes = selectedAgent ? fallbackPermissionModes(selectedAgent) : [];
  const selectedMode = modes.find((mode) => mode.id === activeModeId) ?? modes[0] ?? null;
  const selectedLaunchable = selectedAgent && selectedMode ? canLaunchPermissionMode(selectedAgent, selectedMode) : false;
  const createDisabled = busy || !selectedAgent || !selectedMode || !selectedLaunchable;

  function selectAgent(agent: AgentRuntimeStatus) {
    setSelectedAgentId(agent.id);
    setSelectedModeId(resolveActiveCreateModeId(agent, null));
    setControlValues((current) => ({
      ...current,
      [agent.id]: normalizeLaunchControlValues(agent, current[agent.id] ?? {})
    }));
  }

  function selectedValues(agent: AgentRuntimeStatus) {
    return normalizeLaunchControlValues(agent, controlValues[agent.id] ?? {});
  }

  async function startLastProfile() {
    if (!resolvedLastProfile || busy) return;
    setSelectedAgentId(resolvedLastProfile.agent.id);
    setSelectedModeId(resolvedLastProfile.permissionMode);
    setControlValues((current) => ({
      ...current,
      [resolvedLastProfile.agent.id]: resolvedLastProfile.launchControlValues
    }));
    await onCreate(resolvedLastProfile.agent.id, resolvedLastProfile.permissionMode, {
      ...resolvedLastProfile.launchControlValues,
      permission: resolvedLastProfile.permissionMode
    });
  }

  function configureManually() {
    setConfigExpanded(true);
    setStep("compose");
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedAgent || !selectedMode || createDisabled) return;
    const launchControlValues = {
      ...selectedValues(selectedAgent),
      permission: selectedMode.id
    };
    await onCreate(selectedAgent.id, selectedMode.id, launchControlValues);
  }

  if (resolvedLastProfile && step === "entry") {
    return (
      <section className="page-surface">
        <PageHeader eyebrow="New Session" title={workspace?.name ?? "New session"} />
        <div className="session-create-panel">
          <div className="agent-create-controls">
            <Button className="agent-choice last-profile" isDisabled={busy} onPress={() => void startLastProfile()}>
              <strong>Start last profile</strong>
              <span>
                {resolvedLastProfile.agent.title} / {resolvedLastProfile.modeLabel}
              </span>
            </Button>
            <Button className="agent-choice" onPress={configureManually}>
              <strong>Configure manually</strong>
              <span>Select agent, permission, and launch options</span>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-surface">
      <PageHeader eyebrow="New Session" title={workspace?.name ?? "New session"} />
      <form className="new-session-compose" onSubmit={(event) => void submit(event)}>
        <div className="composer-actions">
          <Button className="secondary" onPress={() => setConfigExpanded((expanded) => !expanded)} type="button">
            {configExpanded ? "Hide configuration" : "Configure"}
          </Button>
          <Button className="primary" isDisabled={Boolean(createDisabled)} onPress={() => void submit()} type="button">
            Create session
          </Button>
        </div>
        {configExpanded ? (
          <AgentConfiguration
            activeModeId={activeModeId}
            agents={createAgents}
            controlValues={selectedAgent ? selectedValues(selectedAgent) : {}}
            onChangeControl={(controlId, value) =>
              selectedAgent &&
              setControlValues((current) => ({
                ...current,
                [selectedAgent.id]: {
                  ...(current[selectedAgent.id] ?? {}),
                  [controlId]: value
                }
              }))
            }
            onSelectAgent={selectAgent}
            onSelectMode={setSelectedModeId}
            selectedAgent={selectedAgent}
          />
        ) : selectedAgent && selectedMode ? (
          <div className="agent-create-detail">
            <div className="agent-create-detail-head">
              <div>
                <strong>{selectedAgent.title}</strong>
                <span>{selectedMode.label}</span>
              </div>
              <span className={`badge ${selectedAgent.status.state}`}>{selectedAgent.status.state}</span>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function AgentConfiguration({
  activeModeId,
  agents,
  controlValues,
  onChangeControl,
  onSelectAgent,
  onSelectMode,
  selectedAgent
}: {
  activeModeId: PermissionModeId | null;
  agents: AgentRuntimeStatus[];
  controlValues: Record<string, string>;
  onChangeControl: (controlId: string, value: string) => void;
  onSelectAgent: (agent: AgentRuntimeStatus) => void;
  onSelectMode: (permissionMode: PermissionModeId) => void;
  selectedAgent: AgentRuntimeStatus | null;
}) {
  const modes = selectedAgent ? fallbackPermissionModes(selectedAgent) : [];
  const controls = (selectedAgent?.launchControls ?? []).filter((control) => control.id !== "permission");
  const selectedMode = modes.find((mode) => mode.id === activeModeId) ?? modes[0] ?? null;

  return (
    <div className="agent-create-flow">
      <div className="agent-create-controls">
        {agents.map((agent) => (
          <Button
            className={`agent-choice ${selectedAgent?.id === agent.id ? "selected" : ""} ${agent.status.state}`}
            key={agent.id}
            onPress={() => onSelectAgent(agent)}
            type="button"
          >
            <strong>{agent.title}</strong>
            <span>{agentStatusText(agent)}</span>
          </Button>
        ))}
      </div>
      {selectedAgent ? (
        <div className={`agent-create-detail ${selectedAgent.status.state}`}>
          <div className="agent-create-detail-head">
            <div>
              <strong>{selectedAgent.title}</strong>
              <span>{agentStatusText(selectedAgent)}</span>
            </div>
            <span className={`badge ${selectedAgent.status.state}`}>{selectedAgent.status.state}</span>
          </div>
          {selectedAgent.status.message ? <p className="muted">{selectedAgent.status.message}</p> : null}
          {controls.length ? (
            <div className="launch-control-options">
              {controls.map((control) => (
                <label key={control.id} title={control.description ?? control.label}>
                  <span>{control.label}</span>
                  <select
                    disabled={!selectedAgent.enabled}
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
              disabled={!selectedAgent.enabled || !modes.some((mode) => canLaunchPermissionMode(selectedAgent, mode))}
              onChange={(event) => onSelectMode(event.target.value as PermissionModeId)}
              value={selectedMode?.id ?? ""}
            >
              {modes.map((mode) => (
                <option disabled={!canLaunchPermissionMode(selectedAgent, mode)} key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function agentStatusText(agent: AgentRuntimeStatus) {
  if (!agent.enabled) return "Disabled";
  if (agent.status.state === "idle") return "Ready";
  if (agent.status.state === "ready") return "Ready";
  return agent.status.message ?? agent.status.state;
}
