import type { AgentPermissionModeStatus, AgentRuntimeStatus, ConnectionStatus, PermissionModeId, Session } from "../types";

const manualMode: AgentPermissionModeStatus = {
  id: "manual",
  label: "Manual",
  description: "Ask before approval-managed actions",
  riskLevel: "low",
  status: { state: "idle", message: "Start session" }
};

export function fallbackPermissionModes(agent: AgentRuntimeStatus): AgentPermissionModeStatus[] {
  if (agent.permissionModes?.length > 0) {
    return agent.permissionModes;
  }
  return [{ ...manualMode, status: agent.status }];
}

export function permissionModeLabel(mode: PermissionModeId, modes: AgentPermissionModeStatus[] = []) {
  return modes.find((item) => item.id === mode)?.label ?? fallbackPermissionModeLabel(mode);
}

export function permissionModeDescription(mode: PermissionModeId, modes: AgentPermissionModeStatus[] = []) {
  return modes.find((item) => item.id === mode)?.description ?? fallbackPermissionModeDescription(mode);
}

export function permissionModeClass(mode: PermissionModeId) {
  return `permission-mode-${mode.replace(/_/g, "-")}`;
}

export function isYoloSession(session: Session) {
  return session.permissionMode === "yolo";
}

export function connectionStatusForMode(
  agent: AgentRuntimeStatus,
  modeId: PermissionModeId,
  fallback: ConnectionStatus = agent.status
) {
  return fallbackPermissionModes(agent).find((mode) => mode.id === modeId)?.status ?? fallback;
}

function fallbackPermissionModeLabel(mode: PermissionModeId) {
  switch (mode) {
    case "manual":
      return "Manual";
    case "full_auto":
      return "Full auto";
    case "yolo":
      return "YOLO";
    default:
      return mode;
  }
}

function fallbackPermissionModeDescription(mode: PermissionModeId) {
  switch (mode) {
    case "manual":
      return "Ask before approval-managed actions";
    case "full_auto":
      return "Sandboxed automatic execution";
    case "yolo":
      return "No approvals / no sandbox";
    default:
      return "Agent-provided permission mode";
  }
}
