import type { AgentPermissionModeStatus, AgentRuntimeStatus, PermissionModeId } from "../../types";
import { fallbackPermissionModes } from "../../utils/permissionMode";

export function canLaunchPermissionMode(agent: AgentRuntimeStatus, mode: AgentPermissionModeStatus) {
  return agent.enabled && mode.status.state !== "starting" && mode.status.state !== "disabled";
}

export function resolveActiveCreateModeId(agent: AgentRuntimeStatus | null, selectedModeId: PermissionModeId | null) {
  if (!agent) return null;
  const modes = fallbackPermissionModes(agent);
  const selectedMode = selectedModeId ? modes.find((mode) => mode.id === selectedModeId) : null;
  if (selectedMode && canLaunchPermissionMode(agent, selectedMode)) return selectedMode.id;
  return modes.find((mode) => canLaunchPermissionMode(agent, mode))?.id ?? modes[0]?.id ?? null;
}
