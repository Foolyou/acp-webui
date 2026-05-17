import type { MessageContentBlock, PermissionModeId, SessionDetail } from "../types";

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
  initialPrompt?: string;
  contentBlocks?: MessageContentBlock[];
  createSession: CreateSession;
  onSessionCreated: (detail: SessionDetail) => Promise<void>;
  submitPrompt: (
    detail: SessionDetail,
    prompt: string,
    contentBlocks?: MessageContentBlock[]
  ) => Promise<void>;
};

export async function createSessionFromCompose({
  workspaceId,
  agentId,
  permissionMode,
  launchControlValues,
  initialPrompt,
  contentBlocks,
  createSession,
  onSessionCreated,
  submitPrompt
}: SessionComposeCreationOptions): Promise<SessionDetail> {
  const detail = await createSession(workspaceId, agentId, permissionMode, launchControlValues);
  await onSessionCreated(detail);

  if (initialPrompt?.trim() || contentBlocks?.length) {
    await submitPrompt(detail, initialPrompt ?? "", contentBlocks);
  }

  return detail;
}
