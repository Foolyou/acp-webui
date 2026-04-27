import type {
  AppData,
  AuthStatus,
  ChatMessage,
  PermissionRequest,
  ReviewArtifact,
  SessionListItem,
  SessionDetail,
  Workspace
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

export const api = {
  authStatus: () => request<AuthStatus>("/api/auth/status"),
  pair: (token: string) =>
    request<AuthStatus>("/api/auth/pair", {
      method: "POST",
      body: JSON.stringify({ token })
    }),
  appState: () => request<AppData>("/api/app-state"),
  workspaces: () => request<Workspace[]>("/api/workspaces"),
  createWorkspace: (path: string) =>
    request<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ path })
    }),
  createSession: (workspaceId: string) =>
    request<SessionDetail>(`/api/workspaces/${workspaceId}/sessions`, {
      method: "POST"
    }),
  sessions: () => request<SessionListItem[]>("/api/sessions"),
  workspaceSessions: (workspaceId: string) => request<SessionListItem[]>(`/api/workspaces/${workspaceId}/sessions`),
  session: (sessionId: string) => request<SessionDetail>(`/api/sessions/${sessionId}`),
  prompt: (sessionId: string, prompt: string) =>
    request<{ message: ChatMessage }>(`/api/sessions/${sessionId}/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt })
    }),
  cancelSession: (sessionId: string) =>
    request<SessionDetail>(`/api/sessions/${sessionId}/cancel`, {
      method: "POST"
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
