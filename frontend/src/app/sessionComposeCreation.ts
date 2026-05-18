import type { PermissionModeId, SessionDetail } from "../types";

type CreateSession = (
  workspaceId: string,
  agentId?: string,
  permissionMode?: PermissionModeId,
  launchControlValues?: Record<string, string>
) => Promise<SessionDetail>;

type SessionComposeCreationOptions = {
  workspaceId: string;
  agentId?: string;
  permissionMode?: PermissionModeId;
  launchControlValues?: Record<string, string>;
  createSession: CreateSession;
  onSessionCreated: (detail: SessionDetail) => Promise<void>;
};

export async function createSessionFromCompose({
  workspaceId,
  agentId,
  permissionMode,
  launchControlValues,
  createSession,
  onSessionCreated
}: SessionComposeCreationOptions): Promise<SessionDetail> {
  const detail = await createSession(workspaceId, agentId, permissionMode, launchControlValues);
  await onSessionCreated(detail);

  return detail;
}
