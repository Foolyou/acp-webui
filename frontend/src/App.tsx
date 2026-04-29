import { RouterProvider } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppDataContext } from "./app/context";
import {
  applySessionListRealtime,
  clearSessionListPermission,
  sessionDetailToListItem,
  setSessionListPermission,
  updateSessionListModel,
  updateSessionListStatus
} from "./app/sessionList";
import { messageToTimelineItem } from "./app/timeline";
import { initialState } from "./app/types";
import type { AppRouterContext, UiState } from "./app/types";
import { api, errorMessage, isUnauthorized } from "./api";
import { PairingView } from "./features/auth/PairingView";
import { applyRealtimeEvent } from "./realtime";
import { placeholderContext, router } from "./routes/router";
import type { AgentRuntimeStatus, AuthStatus, PermissionModeId, PermissionRequest, RealtimeEvent, SessionDetail } from "./types";
import { fallbackPermissionModes } from "./utils/permissionMode";

function clearSensitiveState(current: UiState, auth: AuthStatus | null): UiState {
  return {
    ...current,
    auth,
    codex: initialState.codex,
  agents: [],
    socketState: "disconnected",
    inbox: [],
    sessions: [],
    currentSession: null,
    activeReview: null,
    liveAssistant: "",
    busy: false,
    creatingSessionWorkspaceId: null,
    creatingSessionAgentId: null,
    creatingSessionPermissionMode: null,
    initialized: true
  };
}

function updateAgentStatus(
  agents: AgentRuntimeStatus[],
  agentId: string,
  status: AgentRuntimeStatus["status"],
  permissionMode?: PermissionModeId
): AgentRuntimeStatus[] {
  const existing = agents.find((agent) => agent.id === agentId);
  if (!existing) {
    const fallbackMode = {
      id: permissionMode ?? ("manual" as const),
      label: permissionMode === "yolo" ? "YOLO" : permissionMode === "full_auto" ? "Full auto" : "Manual",
      description:
        permissionMode === "yolo"
          ? "No approvals / no sandbox"
          : permissionMode === "full_auto"
            ? "Sandboxed automatic execution"
            : "Ask before approval-managed actions",
      riskLevel: permissionMode === "yolo" ? ("high" as const) : permissionMode === "full_auto" ? ("medium" as const) : ("low" as const),
      status
    };
    return [
      ...agents,
      {
        id: agentId,
        title: agentId,
        enabled: true,
        status,
        permissionModes: [fallbackMode]
      }
    ];
  }
  return agents.map((agent) => {
    if (agent.id !== agentId) {
      return agent;
    }
    if (!permissionMode) {
      return { ...agent, status };
    }
    return {
      ...agent,
      status: permissionMode === "manual" ? status : agent.status,
      permissionModes: fallbackPermissionModes(agent).map((mode) =>
        mode.id === permissionMode ? { ...mode, status } : mode
      )
    };
  });
}

function pendingPermissionQueue(detail: SessionDetail): PermissionRequest[] {
  const queue = detail.pendingPermissions?.length
    ? detail.pendingPermissions
    : detail.pendingPermission
      ? [detail.pendingPermission]
      : [];
  return [...queue].sort((left, right) => {
    const byDate = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return byDate || left.id.localeCompare(right.id);
  });
}

function detailAfterResolvedPermission(detail: SessionDetail, permissionId: string): SessionDetail {
  const pendingPermissions = pendingPermissionQueue(detail).filter((permission) => permission.id !== permissionId);
  const pendingPermission = pendingPermissions[0] ?? null;
  const pendingApprovalCount = pendingPermissions.length;
  return {
    ...detail,
    pendingPermission,
    pendingPermissions,
    pendingApprovalCount,
    queuedApprovalCount: Math.max(pendingApprovalCount - 1, 0),
    session: {
      ...detail.session,
      status: pendingPermission ? "waiting_approval" : "running"
    }
  };
}

function mergeChatMessage(messages: SessionDetail["messages"], message: SessionDetail["messages"][number]) {
  const next = messages.some((item) => item.id === message.id)
    ? messages.map((item) => (item.id === message.id ? message : item))
    : [...messages, message];
  return next.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function mergeTimelineItem(timeline: SessionDetail["timeline"], item: SessionDetail["timeline"][number]) {
  const key = `${item.kind}-${item.id}`;
  const next = timeline.some((candidate) => `${candidate.kind}-${candidate.id}` === key)
    ? timeline.map((candidate) => (`${candidate.kind}-${candidate.id}` === key ? item : candidate))
    : [...timeline, item];
  return next.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function App() {
  const [state, setState] = useState<UiState>(initialState);
  const reconnectTimer = useRef<number | undefined>(undefined);

  const markUnauthorized = useCallback(async () => {
    const auth = await api.authStatus().catch(() => ({
      access: "anonymous",
      pairingRequired: true,
      clientIp: null
    }));
    setState((current) => clearSensitiveState(current, auth));
  }, []);

  const loadInitialState = useCallback(async (auth: AuthStatus) => {
    const [appState, workspaces, sessions] = await Promise.all([api.appState(), api.workspaces(), api.sessions()]);

    const storedWorkspaceId = localStorage.getItem("currentWorkspaceId");

    setState((current) => ({
      ...current,
      auth,
      codex: appState.codex,
      agents: appState.agents,
      inbox: appState.inbox,
      sessions,
      workspaces,
      currentWorkspaceId: current.currentSession?.workspace.id ?? current.currentWorkspaceId ?? storedWorkspaceId ?? workspaces[0]?.id ?? null,
      currentSession: current.currentSession,
      initialized: true,
      error: null
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const auth = await api.authStatus();
        if (cancelled) return;
        if (auth.access === "anonymous") {
          setState((current) => clearSensitiveState(current, auth));
          return;
        }
        await loadInitialState(auth);
      } catch (error) {
        if (cancelled) return;
        if (isUnauthorized(error)) {
          await markUnauthorized();
          return;
        }
        setState((current) => ({ ...current, error: errorMessage(error), initialized: true }));
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [loadInitialState, markUnauthorized]);

  useEffect(() => {
    if (!state.auth || state.auth.access === "anonymous") {
      return;
    }

    let closedByEffect = false;

    function connect() {
      setState((current) => ({ ...current, socketState: "connecting" }));
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${scheme}://${window.location.host}/api/ws`);

      socket.addEventListener("open", () => {
        setState((current) => ({ ...current, socketState: "connected" }));
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as RealtimeEvent;
        if (message.type === "connection_status") {
          setState((current) => ({
            ...current,
            codex: message.status,
            agents: updateAgentStatus(current.agents, "codex", message.status, "manual")
          }));
          return;
        }
        if (message.type === "agent_connection_status") {
          setState((current) => ({
            ...current,
            codex: message.agentId === "codex" ? message.status : current.codex,
            agents: updateAgentStatus(current.agents, message.agentId, message.status, message.permissionMode)
          }));
          return;
        }
        setState((current) => ({
          ...current,
          ...applyRealtimeEvent(
            {
              currentSession: current.currentSession,
              inbox: current.inbox,
              liveAssistant: current.liveAssistant,
              error: current.error
            },
            message
          ),
          sessions: applySessionListRealtime(current.sessions, message, current.currentSession)
        }));
      });

      socket.addEventListener("close", () => {
        if (closedByEffect) return;
        setState((current) => ({ ...current, socketState: "disconnected" }));
        reconnectTimer.current = window.setTimeout(connect, 1200);
      });

      socket.addEventListener("error", () => {
        setState((current) => ({ ...current, socketState: "disconnected" }));
      });

      return socket;
    }

    const socket = connect();
    return () => {
      closedByEffect = true;
      window.clearTimeout(reconnectTimer.current);
      socket.close();
    };
  }, [state.auth]);

  const selectedWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId) ?? null,
    [state.currentWorkspaceId, state.workspaces]
  );

  const runBusy = useCallback(
    async (action: () => Promise<void>) => {
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        await action();
      } catch (error) {
        if (isUnauthorized(error)) {
          await markUnauthorized();
          return;
        }
        setState((current) => ({ ...current, error: errorMessage(error) }));
      } finally {
        setState((current) => ({ ...current, busy: false }));
      }
    },
    [markUnauthorized]
  );

  const loadSessionList = useCallback(
    async (workspaceId?: string | null) => {
      setState((current) => ({ ...current, sessionsLoading: true, error: null }));
      try {
        const sessions = workspaceId ? await api.workspaceSessions(workspaceId) : await api.sessions();
        setState((current) => ({ ...current, sessions, sessionsLoading: false }));
      } catch (error) {
        if (isUnauthorized(error)) {
          await markUnauthorized();
          return;
        }
        setState((current) => ({ ...current, error: errorMessage(error), sessionsLoading: false }));
      }
    },
    [markUnauthorized]
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        const detail = await api.session(sessionId);
        localStorage.setItem("currentWorkspaceId", detail.workspace.id);
        localStorage.setItem("currentSessionId", detail.session.id);
        setState((current) => ({
          ...current,
          currentSession: detail,
          currentWorkspaceId: detail.workspace.id,
          liveAssistant: ""
        }));
      } catch (error) {
        if (isUnauthorized(error)) {
          await markUnauthorized();
          return;
        }
        throw error;
      }
    },
    [markUnauthorized]
  );

  const createWorkspace = useCallback(
    async (path: string) => {
      await runBusy(async () => {
        const workspace = await api.createWorkspace(path);
        localStorage.setItem("currentWorkspaceId", workspace.id);
        localStorage.removeItem("currentSessionId");
        setState((current) => ({
          ...current,
          workspaces: [workspace, ...current.workspaces.filter((item) => item.id !== workspace.id)],
          currentWorkspaceId: workspace.id,
          currentSession: null
        }));
        await router.navigate({ to: "/workspaces/$workspaceId/sessions", params: { workspaceId: workspace.id } });
      });
    },
    [runBusy]
  );

  const createSession = useCallback(async (workspaceId: string, agentId?: string, permissionMode?: PermissionModeId) => {
    setState((current) => ({
      ...current,
      creatingSessionWorkspaceId: workspaceId,
      creatingSessionAgentId: agentId ?? null,
      creatingSessionPermissionMode: permissionMode ?? "manual",
      error: null
    }));
    await router.navigate({ to: "/workspaces/$workspaceId/sessions/new", params: { workspaceId } });
    try {
      const detail = await api.createSession(workspaceId, agentId, permissionMode);
      localStorage.setItem("currentWorkspaceId", detail.workspace.id);
      localStorage.setItem("currentSessionId", detail.session.id);
      setState((current) => ({
        ...current,
        currentSession: detail,
        currentWorkspaceId: detail.workspace.id,
        creatingSessionWorkspaceId: null,
        creatingSessionAgentId: null,
        creatingSessionPermissionMode: null,
        sessions: [sessionDetailToListItem(detail), ...current.sessions.filter((item) => item.session.id !== detail.session.id)],
        liveAssistant: ""
      }));
      await router.navigate({
        to: "/workspaces/$workspaceId/sessions/$sessionId",
        params: { workspaceId: detail.workspace.id, sessionId: detail.session.id },
        replace: true
      });
    } catch (error) {
      if (isUnauthorized(error)) {
        await markUnauthorized();
        return;
      }
      setState((current) => ({
        ...current,
        creatingSessionWorkspaceId: null,
        creatingSessionAgentId: null,
        creatingSessionPermissionMode: null,
        error: errorMessage(error)
      }));
    }
  }, [markUnauthorized]);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      const sessionId = state.currentSession?.session.id;
      const previousStatus = state.currentSession?.session.status ?? "idle";
      if (!sessionId) return;
      await runBusy(async () => {
        setState((current) =>
          current.currentSession?.session.id === sessionId
            ? {
                ...current,
                currentSession: {
                  ...current.currentSession,
                  session: { ...current.currentSession.session, status: "running" }
                },
                sessions: updateSessionListStatus(current.sessions, sessionId, "running"),
                liveAssistant: ""
              }
            : current
        );
        let response: Awaited<ReturnType<typeof api.prompt>>;
        try {
          response = await api.prompt(sessionId, prompt);
        } catch (error) {
          setState((current) =>
            current.currentSession?.session.id === sessionId && current.currentSession.session.status === "running"
              ? {
                  ...current,
                  currentSession: {
                    ...current.currentSession,
                    session: { ...current.currentSession.session, status: previousStatus }
                  },
                  sessions: updateSessionListStatus(current.sessions, sessionId, previousStatus)
                }
              : current
          );
          throw error;
        }
        setState((current) =>
          current.currentSession?.session.id === sessionId
            ? {
                ...current,
                currentSession: {
                  ...current.currentSession,
                  messages: mergeChatMessage(current.currentSession.messages, response.message),
                  timeline: mergeTimelineItem(current.currentSession.timeline, messageToTimelineItem(response.message))
                },
                liveAssistant: ""
              }
            : current
        );
      });
    },
    [runBusy, state.currentSession?.session.id, state.currentSession?.session.status]
  );

  const setSessionConfigOption = useCallback(
    async (configId: string, value: string) => {
      const sessionId = state.currentSession?.session.id;
      if (!sessionId) return;
      await runBusy(async () => {
        const response = await api.setSessionConfigOption(sessionId, configId, value);
        setState((current) =>
          current.currentSession?.session.id === sessionId
            ? {
                ...current,
                currentSession: {
                  ...current.currentSession,
                  configOptions: response.configOptions ?? null,
                  currentModel: response.currentModel ?? null
                },
                sessions: updateSessionListModel(current.sessions, sessionId, response.currentModel ?? null)
              }
            : current
        );
      });
    },
    [runBusy, state.currentSession?.session.id]
  );

  const restoreSession = useCallback(
    async (sessionId: string) => {
      await runBusy(async () => {
        const detail = await api.restoreSession(sessionId);
        localStorage.setItem("currentWorkspaceId", detail.workspace.id);
        localStorage.setItem("currentSessionId", detail.session.id);
        setState((current) => ({
          ...current,
          currentSession: detail,
          currentWorkspaceId: detail.workspace.id,
          sessions: [
            sessionDetailToListItem(detail),
            ...current.sessions.filter((item) => item.session.id !== detail.session.id)
          ],
          liveAssistant: ""
        }));
      });
    },
    [runBusy]
  );

  const resolvePermission = useCallback(
    async (permission: PermissionRequest, optionId: string) => {
      await runBusy(async () => {
        await api.resolvePermission(permission.id, optionId);
        setState((current) =>
          current.currentSession
            ? (() => {
                const nextDetail = detailAfterResolvedPermission(current.currentSession, permission.id);
                const nextPermission = nextDetail.pendingPermission;
                return {
                  ...current,
                  currentSession: nextDetail,
                  sessions: nextPermission
                    ? setSessionListPermission(
                        current.sessions,
                        permission.sessionId,
                        {
                          id: nextPermission.id,
                          title: nextPermission.title,
                          kind: nextPermission.kind,
                          createdAt: nextPermission.createdAt
                        },
                        nextDetail.queuedApprovalCount ?? 0,
                        nextDetail
                      )
                    : clearSessionListPermission(
                        updateSessionListStatus(current.sessions, permission.sessionId, "running"),
                        permission.sessionId
                      ),
                  inbox: nextPermission
                    ? current.inbox.map((item) =>
                        item.session.id === permission.sessionId
                          ? {
                              ...item,
                              permission: nextPermission,
                              queuedApprovalCount: nextDetail.queuedApprovalCount ?? 0,
                              session: { ...item.session, status: "waiting_approval" }
                            }
                          : item
                      )
                    : current.inbox.filter((item) => item.session.id !== permission.sessionId)
                };
              })()
            : current
        );
      });
    },
    [runBusy]
  );

  const cancelApproval = useCallback(async () => {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const detail = await api.cancelSession(sessionId);
      setState((current) => ({
        ...current,
        currentSession: detail,
        sessions: [
          sessionDetailToListItem(detail),
          ...current.sessions.filter((item) => item.session.id !== detail.session.id)
        ],
        inbox: current.inbox.filter((item) => item.session.id !== sessionId)
      }));
    });
  }, [runBusy, state.currentSession?.session.id]);

  const openReviewArtifact = useCallback(
    async (artifactId: string) => {
      const sessionId = state.currentSession?.session.id;
      if (!sessionId) return;
      await runBusy(async () => {
        const artifact = await api.reviewArtifact(sessionId, artifactId);
        setState((current) => ({ ...current, activeReview: artifact }));
      });
    },
    [runBusy, state.currentSession?.session.id]
  );

  const openDiffFallback = useCallback(async () => {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const response = await api.reviewDiff(sessionId);
      setState((current) => ({ ...current, activeReview: response.artifact }));
    });
  }, [runBusy, state.currentSession?.session.id]);

  const setCurrentWorkspace = useCallback((workspaceId: string | null) => {
    if (workspaceId) localStorage.setItem("currentWorkspaceId", workspaceId);
    setState((current) => ({ ...current, currentWorkspaceId: workspaceId }));
  }, []);

  const pairBrowser = useCallback(
    async (token: string) => {
      const auth = await api.pair(token);
      await loadInitialState(auth);
    },
    [loadInitialState]
  );

  const context = useMemo<AppRouterContext>(
    () => ({
      actions: {
        cancelApproval,
        createSession,
        createWorkspace,
        loadSession,
        loadSessionList,
        openDiffFallback,
        openReviewArtifact,
        resolvePermission,
        restoreSession,
        sendPrompt,
        setSessionConfigOption,
        setActiveReview: (artifact) => setState((current) => ({ ...current, activeReview: artifact })),
        setCurrentWorkspace
      },
      selectedWorkspace,
      state
    }),
    [
      cancelApproval,
      createSession,
      createWorkspace,
      loadSession,
      loadSessionList,
      openDiffFallback,
      openReviewArtifact,
      resolvePermission,
      restoreSession,
      selectedWorkspace,
      sendPrompt,
      setSessionConfigOption,
      setCurrentWorkspace,
      state
    ]
  );

  if (state.auth?.access === "anonymous") {
    return <PairingView auth={state.auth} onPair={pairBrowser} />;
  }

  return (
    <AppDataContext.Provider value={context}>
      <RouterProvider context={placeholderContext} router={router} />
    </AppDataContext.Provider>
  );
}
