import type {
  AppData,
  AuthStatus,
  ChatMessage,
  PermissionRequest,
  PermissionModeId,
  PromptTemplate,
  QueuedPrompt,
  ReviewArtifact,
  ActiveTurn,
  MessageContentBlock,
  SessionConfigState,
  SessionListItem,
  SessionDetail,
  SkillSummary,
  Workspace,
  WorkspaceDeletePlan
} from "./types";

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-acp-webui-request": "1",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Keep the HTTP status text when the body is not JSON.
    }
    if (response.status === 401) {
      throw new UnauthorizedError(message);
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "x-acp-webui-request": "1"
    },
    body: form
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Keep the HTTP status text when the body is not JSON.
    }
    if (response.status === 401) {
      throw new UnauthorizedError(message);
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  authStatus: () => request<AuthStatus>("/api/auth/status"),
  pair: (token: string) =>
    request<AuthStatus>("/api/auth/pair", {
      method: "POST",
      body: JSON.stringify({ token })
    }),
  appState: () => request<AppData>("/api/app-state"),
  transcribeAudio: (audio: Blob, fileName = "recording.webm") => {
    const form = new FormData();
    form.append("file", audio, fileName);
    return requestForm<{ text: string }>("/api/audio/transcriptions", form);
  },
  workspaces: () => request<Workspace[]>("/api/workspaces"),
  createWorkspace: (path: string) =>
    request<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ path })
    }),
  workspace: (workspaceId: string) => request<Workspace>(`/api/workspaces/${encodeURIComponent(workspaceId)}`),
  updateWorkspace: (workspaceId: string, update: { name?: string; path?: string }) =>
    request<Workspace>(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    }),
  deleteWorkspace: (workspaceId: string) =>
    request<WorkspaceDeletePlan>(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "DELETE"
    }),
  createSession: (
    workspaceId: string,
    agentId?: string,
    permissionMode?: PermissionModeId,
    launchControlValues?: Record<string, string>
  ) =>
    request<SessionDetail>(`/api/workspaces/${workspaceId}/sessions`, {
      method: "POST",
      body:
        agentId || permissionMode || launchControlValues
          ? JSON.stringify({
              ...(agentId ? { agentId } : {}),
              ...(permissionMode ? { permissionMode } : {}),
              ...(launchControlValues ? { launchControlValues } : {})
            })
          : undefined
    }),
  skills: () => request<SkillSummary[]>("/api/skills"),
  sessions: () => request<SessionListItem[]>("/api/sessions"),
  workspaceSessions: (workspaceId: string) => request<SessionListItem[]>(`/api/workspaces/${workspaceId}/sessions`),
  workspaceAgentSessions: (workspaceId: string, agentId: string) =>
    request<SessionListItem[]>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/sessions`
    ),
  session: (sessionId: string) => request<SessionDetail>(`/api/sessions/${sessionId}`),
  updateSession: (sessionId: string, update: { title?: string | null }) =>
    request<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    }),
  deleteSession: (sessionId: string) =>
    request<SessionDetail["session"]>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE"
    }),
  promptTemplates: (workspaceId: string, agentId: string) =>
    request<PromptTemplate[]>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/prompt-templates`
    ),
  createPromptTemplate: (
    workspaceId: string,
    agentId: string,
    template: { title: string; body: string; tags?: string[]; position?: number }
  ) =>
    request<PromptTemplate>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/prompt-templates`,
      {
        method: "POST",
        body: JSON.stringify(template)
      }
    ),
  updatePromptTemplate: (templateId: string, template: { title?: string; body?: string; tags?: string[]; position?: number }) =>
    request<PromptTemplate>(`/api/prompt-templates/${encodeURIComponent(templateId)}`, {
      method: "PATCH",
      body: JSON.stringify(template)
    }),
  deletePromptTemplate: (templateId: string) =>
    request<PromptTemplate>(`/api/prompt-templates/${encodeURIComponent(templateId)}`, {
      method: "DELETE"
    }),
  usePromptTemplate: (templateId: string) =>
    request<PromptTemplate>(`/api/prompt-templates/${encodeURIComponent(templateId)}/use`, {
      method: "POST"
    }),
  restoreSession: (sessionId: string) =>
    request<SessionDetail>(`/api/sessions/${sessionId}/restore`, {
      method: "POST"
    }),
  setSessionConfigOption: (sessionId: string, configId: string, value: string) =>
    request<SessionConfigState>(`/api/sessions/${sessionId}/config-options/${encodeURIComponent(configId)}`, {
      method: "POST",
      body: JSON.stringify({ value })
    }),
  prompt: (sessionId: string, prompt: string, contentBlocks?: MessageContentBlock[]) =>
    request<{
      message: ChatMessage;
      queuedPrompt?: QueuedPrompt | null;
      queuedPrompts?: QueuedPrompt[];
      activeTurn?: ActiveTurn | null;
    }>(`/api/sessions/${sessionId}/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt, ...(contentBlocks?.length ? { contentBlocks } : {}) })
    }),
  cancelSession: (sessionId: string, options?: { clearQueuedPrompts?: boolean }) =>
    request<SessionDetail>(`/api/sessions/${sessionId}/cancel`, {
      method: "POST",
      body: options ? JSON.stringify(options) : undefined
    }),
  resolvePermission: (permissionId: string, optionId: string) =>
    request<PermissionRequest>(`/api/permission-requests/${permissionId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ optionId })
    }),
  reviewArtifact: (sessionId: string, artifactId: string) =>
    request<ReviewArtifact>(`/api/sessions/${sessionId}/review-artifacts/${artifactId}`),
  reviewDiff: (sessionId: string) =>
    request<{ artifact: ReviewArtifact }>(`/api/sessions/${sessionId}/review-diff`)
};

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isUnauthorized(error: unknown) {
  return error instanceof UnauthorizedError;
}
