import type { ConnectionStatus, SessionConfigOption, SessionConfigSelectOption, SessionConfigSelectValue, SessionDetail } from "../types";

export function modelConfigOption(configOptions?: SessionConfigOption[] | null): SessionConfigOption | null {
  const options = configOptions ?? [];
  return (
    options.find((option) => isSelectOption(option) && option.category === "model") ??
    options.find((option) => isSelectOption(option) && option.id === "model") ??
    null
  );
}

export function selectValues(option: SessionConfigOption | null | undefined): SessionConfigSelectValue[] {
  if (!option?.options) {
    return [];
  }
  return option.options.flatMap((item) => (isOptionGroup(item) ? item.options : [item]));
}

export function sessionConfigSelectOptions(configOptions?: SessionConfigOption[] | null): SessionConfigOption[] {
  return (configOptions ?? []).filter((option) => selectValues(option).length > 0);
}

export function currentModelLabel(option: SessionConfigOption | null | undefined): string | null {
  const value = option?.currentValue;
  if (!value) {
    return null;
  }
  return selectValues(option).find((item) => item.value === value)?.name ?? value;
}

export function modelSwitchDisabledReason(
  session: SessionDetail,
  agentConnection: ConnectionStatus | null
): string | null {
  if (session.session.status === "running") {
    return "Model switching is disabled while the session is running.";
  }
  if (session.session.status === "waiting_approval" || session.pendingPermission) {
    return "Resolve the pending approval before changing models.";
  }
  if (!session.continuable) {
    return session.viewOnlyReason ?? session.continuity.reason ?? "Restore this session before changing models.";
  }
  if (agentConnection && agentConnection.state !== "ready") {
    return agentConnection.message ?? `${session.session.agentName} is ${agentConnection.state}.`;
  }
  return null;
}

function isSelectOption(option: SessionConfigOption): boolean {
  return option.type === "select" && Boolean(option.currentValue) && Boolean(option.options?.length);
}

function isOptionGroup(item: SessionConfigSelectOption): item is Extract<SessionConfigSelectOption, { options: SessionConfigSelectValue[] }> {
  return Array.isArray((item as { options?: unknown }).options);
}
