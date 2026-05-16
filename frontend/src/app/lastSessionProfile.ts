import type { AgentRuntimeStatus, PermissionModeId } from "../types";
import { fallbackPermissionModes } from "../utils/permissionMode";

const storageKey = "lastSessionProfile";
const workspaceStorageKey = "lastSessionProfilesByWorkspace";

export type LastSessionProfile = {
  agentId: string;
  permissionMode: PermissionModeId;
  launchControlValues: Record<string, string>;
};

export type ResolvedLastSessionProfile = LastSessionProfile & {
  agent: AgentRuntimeStatus;
  modeLabel: string;
};

export function readLastSessionProfile(storage: Storage = localStorage): LastSessionProfile | null {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LastSessionProfile>;
    if (!value.agentId || !value.permissionMode || typeof value.launchControlValues !== "object") {
      return null;
    }
    return {
      agentId: value.agentId,
      permissionMode: value.permissionMode,
      launchControlValues: value.launchControlValues ?? {}
    };
  } catch {
    return null;
  }
}

export function writeLastSessionProfile(profile: LastSessionProfile, storage: Storage = localStorage) {
  storage.setItem(storageKey, JSON.stringify(profile));
}

export function readLastWorkspaceSessionProfile(
  workspaceId: string,
  storage: Storage = localStorage
): LastSessionProfile | null {
  const profiles = readWorkspaceProfiles(storage);
  return profiles[workspaceId] ?? readLastSessionProfile(storage);
}

export function writeLastWorkspaceSessionProfile(
  workspaceId: string,
  profile: LastSessionProfile,
  storage: Storage = localStorage
) {
  const profiles = readWorkspaceProfiles(storage);
  storage.setItem(
    workspaceStorageKey,
    JSON.stringify({
      version: 1,
      profiles: {
        ...profiles,
        [workspaceId]: profile
      }
    })
  );
}

export function resolveLastSessionProfile(
  agents: AgentRuntimeStatus[],
  profile: LastSessionProfile | null
): ResolvedLastSessionProfile | null {
  if (!profile) return null;
  const agent = agents.find((item) => item.id === profile.agentId);
  if (!agent) return null;
  const mode = fallbackPermissionModes(agent).find((item) => item.id === profile.permissionMode);
  if (!mode || !isLaunchable(agent, mode.status.state)) return null;

  return {
    ...profile,
    agent,
    launchControlValues: normalizeLaunchControlValues(agent, profile.launchControlValues),
    modeLabel: mode.label
  };
}

export function normalizeLaunchControlValues(agent: AgentRuntimeStatus, values: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const control of agent.launchControls ?? []) {
    const stored = values[control.id];
    const option = control.options.find((item) => item.value === stored);
    next[control.id] = option?.value ?? control.defaultValue;
  }
  return next;
}

export function isLaunchable(agent: AgentRuntimeStatus, state: string) {
  return agent.enabled && state !== "starting" && state !== "disabled";
}

function readWorkspaceProfiles(storage: Storage): Record<string, LastSessionProfile> {
  try {
    const raw = storage.getItem(workspaceStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { profiles?: Record<string, Partial<LastSessionProfile>> };
    const profiles = parsed.profiles ?? {};
    return Object.fromEntries(
      Object.entries(profiles).flatMap(([workspaceId, profile]) => {
        if (!profile.agentId || !profile.permissionMode || typeof profile.launchControlValues !== "object") {
          return [];
        }
        return [
          [
            workspaceId,
            {
              agentId: profile.agentId,
              permissionMode: profile.permissionMode,
              launchControlValues: profile.launchControlValues ?? {}
            }
          ]
        ];
      })
    );
  } catch {
    return {};
  }
}
