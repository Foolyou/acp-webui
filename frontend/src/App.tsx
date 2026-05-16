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
import { liveAssistantAfterSessionReconcile } from "./app/liveAssistant";
import { canApplySessionListLoad } from "./app/sessionListLoad";
import {
  beginScopedSessionListRefresh,
  canApplyScopedSessionListRefresh,
  createScopedSessionListRefreshState,
  syncScopedSessionListRefreshScope
} from "./app/scopedSessionListRefresh";
import {
  createRestoredSessionDetailRouteTarget,
  createSessionCreatingRouteTarget,
  createSessionDetailRouteTarget
} from "./app/sessionCreationRoutes";
import { messageToTimelineItem } from "./app/timeline";
import { initialState } from "./app/types";
import type { AppRouterContext, UiState } from "./app/types";
import {
  forgetWorkspaceAgent,
  readWorkspaceAgentNavigation,
  rememberWorkspaceAgent,
  workspaceSessionsRouteTarget
} from "./app/workspaceAgentNavigation";
import { api, errorMessage, isUnauthorized } from "./api";
import { PairingView } from "./features/auth/PairingView";
import { applyRealtimeEvent } from "./realtime";
import { placeholderContext, router } from "./routes/router";
import type {
  AgentRuntimeStatus,
  AuthStatus,
  MessageContentBlock,
  PermissionModeId,
  PermissionRequest,
  RealtimeEvent,
  Session,
  SessionDetail,
  Workspace
} from "./types";
import { notifyForRealtimeTransition } from "./utils/browserNotifications";
import { fallbackPermissionModes } from "./utils/permissionMode";

function clearSensitiveState(current: UiState, auth: AuthStatus | null): UiState {
  return {
    ...current,
    auth,
    codex: initialState.codex,
    agents: [],
    socketState: "disconnected",
    inbox: [],
    transcription: initialState.transcription,
    sessions: [],
    currentAgentId: null,
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
        permissionModes: [fallbackMode],
        launchControls: []
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

function replaceWorkspaceInState(current: UiState, workspace: Workspace): UiState {
  return {
    ...current,
    workspaces: current.workspaces.map((item) => (item.id === workspace.id ? workspace : item)),
    currentSession:
      current.currentSession?.workspace.id === workspace.id
        ? { ...current.currentSession, workspace }
        : current.currentSession,
    sessions: current.sessions.map((item) =>
      item.workspace.id === workspace.id ? { ...item, workspace } : item
    )
  };
}

function replaceSessionInState(current: UiState, detail: SessionDetail): UiState {
  return {
    ...current,
    currentSession:
      current.currentSession?.session.id === detail.session.id ? detail : current.currentSession,
    sessions: [
      sessionDetailToListItem(detail),
      ...current.sessions.filter((item) => item.session.id !== detail.session.id)
    ],
    liveAssistant:
      current.currentSession?.session.id === detail.session.id
        ? liveAssistantAfterSessionReconcile(current.liveAssistant, detail)
        : current.liveAssistant
  };
}

function removeSessionFromState(current: UiState, session: Session): UiState {
  return {
    ...current,
    currentSession: current.currentSession?.session.id === session.id ? null : current.currentSession,
    sessions: current.sessions.filter((item) => item.session.id !== session.id),
    liveAssistant: current.currentSession?.session.id === session.id ? "" : current.liveAssistant
  };
}

async function waitForPromptSessionDetail(sessionId: string, queued: boolean) {
  const deadline = Date.now() + (queued ? 0 : 5_000);
  let lastDetail: SessionDetail | null = null;

  while (Date.now() < deadline || lastDetail === null) {
    lastDetail = await api.session(sessionId);
    if (
      queued ||
      lastDetail.pendingPermission ||
      lastDetail.session.status !== "running" ||
      lastDetail.activeTurn === null
    ) {
      return lastDetail;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  return lastDetail;
}

export function App() {
  const [state, setState] = useState<UiState>(initialState);
  const reconnectTimer = useRef<number | undefined>(undefined);
  const currentSessionIdRef = useRef<string | null>(null);
  const notifiedTurnCompletionsRef = useRef(new Set<string>());
  const sessionListLoadGenerationRef = useRef(0);
  const scopedRefreshRef = useRef(createScopedSessionListRefreshState({
    currentWorkspaceId: initialState.currentWorkspaceId,
    currentAgentId: initialState.currentAgentId
  }));

  useEffect(() => {
    currentSessionIdRef.current = state.currentSession?.session.id ?? null;
  }, [state.currentSession?.session.id]);

  useEffect(() => {
    scopedRefreshRef.current = syncScopedSessionListRefreshScope(scopedRefreshRef.current, {
      currentWorkspaceId: state.currentWorkspaceId,
      currentAgentId: state.currentAgentId
    });
  }, [state.currentWorkspaceId, state.currentAgentId]);

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
    const rememberedAgents = readWorkspaceAgentNavigation().currentAgentIdByWorkspace;

    setState((current) => {
      const currentWorkspaceId =
        current.currentSession?.workspace.id ?? current.currentWorkspaceId ?? storedWorkspaceId ?? workspaces[0]?.id ?? null;
      return {
        ...current,
        auth,
        codex: appState.codex,
        agents: appState.agents,
        inbox: appState.inbox,
        transcription: appState.transcription ?? { available: false, maxAudioBytes: 0 },
        sessions,
        workspaces,
        currentWorkspaceId,
        currentAgentId: current.currentSession?.session.agentId ?? null,
        currentAgentIdByWorkspace: rememberedAgents,
        currentSession: current.currentSession,
        initialized: true,
        error: null
      };
    });
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
    let socket: WebSocket | null = null;

    async function reconcileCurrentSession() {
      const sessionId = currentSessionIdRef.current;
      if (!sessionId) return;
      try {
        const detail = await api.session(sessionId);
        setState((current) =>
          current.currentSession?.session.id === sessionId
            ? {
                ...current,
                currentSession: detail,
                sessions: [
                  sessionDetailToListItem(detail),
                  ...current.sessions.filter((item) => item.session.id !== detail.session.id)
                ],
                liveAssistant: liveAssistantAfterSessionReconcile(current.liveAssistant, detail)
              }
            : current
        );
      } catch (error) {
        if (isUnauthorized(error)) {
          await markUnauthorized();
        }
      }
    }

    async function refreshScopedSessionList(message: Extract<RealtimeEvent, { type: "session_list_changed" }>) {
      const started = beginScopedSessionListRefresh(scopedRefreshRef.current, message);
      scopedRefreshRef.current = started.state;
      if (!started.token) {
        return;
      }
      const refreshToken = started.token;
      try {
        const sessions = refreshToken.agentId
          ? await api.workspaceAgentSessions(refreshToken.workspaceId, refreshToken.agentId)
          : await api.workspaceSessions(refreshToken.workspaceId);
        setState((current) =>
          canApplyScopedSessionListRefresh(refreshToken, scopedRefreshRef.current, {
            currentWorkspaceId: current.currentWorkspaceId,
            currentAgentId: current.currentAgentId
          })
            ? { ...current, sessions }
            : current
        );
      } catch (error) {
        if (isUnauthorized(error)) {
          await markUnauthorized();
          return;
        }
        setState((current) =>
          canApplyScopedSessionListRefresh(refreshToken, scopedRefreshRef.current, {
            currentWorkspaceId: current.currentWorkspaceId,
            currentAgentId: current.currentAgentId
          })
            ? { ...current, error: errorMessage(error) }
            : current
        );
      }
    }

    function scheduleReconnect() {
      if (closedByEffect || reconnectTimer.current !== undefined) return;
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = undefined;
        connect();
      }, 1200);
    }

    function connect() {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
      setState((current) => ({ ...current, socketState: "connecting" }));
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const nextSocket = new WebSocket(`${scheme}://${window.location.host}/api/ws`);
      socket = nextSocket;

      nextSocket.addEventListener("open", () => {
        setState((current) => ({ ...current, socketState: "connected" }));
        void reconcileCurrentSession();
      });

      nextSocket.addEventListener("message", (event) => {
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
        if (message.type === "session_list_changed") {
          void refreshScopedSessionList(message);
          return;
        }
        if (message.type === "workspace_changed") {
          setState((current) => replaceWorkspaceInState(current, message.workspace));
          return;
        }
        if (message.type === "workspace_deleted") {
          setState((current) => {
            const nextWorkspaces = current.workspaces.filter((workspace) => workspace.id !== message.workspaceId);
            const currentWorkspaceDeleted = current.currentWorkspaceId === message.workspaceId;
            const currentSessionDeleted = current.currentSession?.workspace.id === message.workspaceId;
            return {
              ...current,
              workspaces: nextWorkspaces,
              sessions: current.sessions.filter((item) => item.workspace.id !== message.workspaceId),
              currentWorkspaceId: currentWorkspaceDeleted ? null : current.currentWorkspaceId,
              currentAgentId: currentWorkspaceDeleted ? null : current.currentAgentId,
              currentSession: currentSessionDeleted ? null : current.currentSession,
              liveAssistant: currentSessionDeleted ? "" : current.liveAssistant
            };
          });
          return;
        }
        if (message.type === "session_updated") {
          void reconcileCurrentSession();
          return;
        }
        if (message.type === "session_deleted") {
          setState((current) => ({
            ...current,
            currentSession: current.currentSession?.session.id === message.sessionId ? null : current.currentSession,
            sessions: current.sessions.filter((item) => item.session.id !== message.sessionId),
            liveAssistant: current.currentSession?.session.id === message.sessionId ? "" : current.liveAssistant
          }));
          return;
        }
        setState((current) => {
          const snapshot = applyRealtimeEvent(
            {
              currentSession: current.currentSession,
              inbox: current.inbox,
              liveAssistant: current.liveAssistant,
              error: current.error
            },
            message
          );
          notifyForRealtimeTransition(
            current.currentSession,
            snapshot.currentSession,
            message,
            notifiedTurnCompletionsRef.current
          );
          return {
            ...current,
            ...snapshot,
            sessions: applySessionListRealtime(current.sessions, message, current.currentSession)
          };
        });
      });

      nextSocket.addEventListener("close", () => {
        if (closedByEffect) return;
        setState((current) => ({ ...current, socketState: "disconnected" }));
        scheduleReconnect();
      });

      nextSocket.addEventListener("error", () => {
        setState((current) => ({ ...current, socketState: "disconnected" }));
        nextSocket.close();
        scheduleReconnect();
      });
    }

    connect();
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (!socket || socket.readyState >= WebSocket.CLOSING) {
          connect();
        }
        void reconcileCurrentSession();
      }
    }
    function onOnline() {
      if (!socket || socket.readyState >= WebSocket.CLOSING) {
        connect();
      }
      void reconcileCurrentSession();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    return () => {
      closedByEffect = true;
      window.clearTimeout(reconnectTimer.current);
      socket?.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [markUnauthorized, state.auth]);

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
    async (workspaceId?: string | null, agentId?: string | null) => {
      const loadToken = {
        workspaceId,
        agentId,
        generation: sessionListLoadGenerationRef.current + 1
      };
      sessionListLoadGenerationRef.current = loadToken.generation;
      setState((current) => ({ ...current, sessionsLoading: true, error: null }));
      try {
        const sessions =
          workspaceId && agentId
            ? await api.workspaceAgentSessions(workspaceId, agentId)
            : workspaceId
              ? await api.workspaceSessions(workspaceId)
              : await api.sessions();
        setState((current) =>
          canApplySessionListLoad(loadToken, sessionListLoadGenerationRef.current, current)
            ? { ...current, sessions, sessionsLoading: false }
            : current
        );
      } catch (error) {
        if (isUnauthorized(error)) {
          await markUnauthorized();
          return;
        }
        setState((current) =>
          canApplySessionListLoad(loadToken, sessionListLoadGenerationRef.current, current)
            ? { ...current, error: errorMessage(error), sessionsLoading: false }
            : current
        );
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
          currentAgentId: detail.session.agentId,
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
        const target = workspaceSessionsRouteTarget(workspace.id);
        localStorage.setItem("currentWorkspaceId", workspace.id);
        localStorage.removeItem("currentSessionId");
        setState((current) => ({
          ...current,
          workspaces: [workspace, ...current.workspaces.filter((item) => item.id !== workspace.id)],
          currentWorkspaceId: workspace.id,
          currentAgentId: null,
          currentSession: null
        }));
        await router.navigate(target);
      });
    },
    [runBusy, state.agents]
  );

  const updateWorkspace = useCallback(
    async (workspaceId: string, update: { name?: string; path?: string }) => {
      await runBusy(async () => {
        const workspace = await api.updateWorkspace(workspaceId, update);
        setState((current) => replaceWorkspaceInState(current, workspace));
      });
    },
    [runBusy]
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      await runBusy(async () => {
        await api.deleteWorkspace(workspaceId);
        setState((current) => {
          const nextWorkspaces = current.workspaces.filter((workspace) => workspace.id !== workspaceId);
          const currentWorkspaceDeleted = current.currentWorkspaceId === workspaceId;
          const currentSessionDeleted = current.currentSession?.workspace.id === workspaceId;
          return {
            ...current,
            workspaces: nextWorkspaces,
            sessions: current.sessions.filter((item) => item.workspace.id !== workspaceId),
            currentWorkspaceId: currentWorkspaceDeleted ? null : current.currentWorkspaceId,
            currentAgentId: currentWorkspaceDeleted ? null : current.currentAgentId,
            currentSession: currentSessionDeleted ? null : current.currentSession,
            liveAssistant: currentSessionDeleted ? "" : current.liveAssistant
          };
        });
        localStorage.removeItem("currentSessionId");
        if (state.currentWorkspaceId === workspaceId) {
          localStorage.removeItem("currentWorkspaceId");
          await router.navigate({ to: "/workspaces" });
        }
      });
    },
    [runBusy, state.currentWorkspaceId]
  );

  const createSession = useCallback(async (
    workspaceId: string,
    agentId?: string,
    permissionMode?: PermissionModeId,
    launchControlValues?: Record<string, string>
  ) => {
    setState((current) => ({
      ...current,
      creatingSessionWorkspaceId: workspaceId,
      creatingSessionAgentId: agentId ?? null,
      creatingSessionPermissionMode: permissionMode ?? "manual",
      error: null
    }));
    await router.navigate(createSessionCreatingRouteTarget(workspaceId, agentId));
    try {
      const detail = await api.createSession(workspaceId, agentId, permissionMode, launchControlValues);
      localStorage.setItem("currentWorkspaceId", detail.workspace.id);
      localStorage.setItem("currentSessionId", detail.session.id);
      setState((current) => ({
        ...current,
        currentSession: detail,
        currentWorkspaceId: detail.workspace.id,
        currentAgentId: detail.session.agentId,
        creatingSessionWorkspaceId: null,
        creatingSessionAgentId: null,
        creatingSessionPermissionMode: null,
        sessions: [sessionDetailToListItem(detail), ...current.sessions.filter((item) => item.session.id !== detail.session.id)],
        liveAssistant: ""
      }));
      await router.navigate(createSessionDetailRouteTarget(agentId, detail));
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
    async (prompt: string, contentBlocks?: MessageContentBlock[]) => {
      const sessionId = state.currentSession?.session.id;
      const previousStatus = state.currentSession?.session.status ?? "idle";
      if (!sessionId) return;
      await runBusy(async () => {
        const activeBeforeSubmit = ["running", "waiting_approval", "stopping"].includes(previousStatus);
        setState((current) =>
          current.currentSession?.session.id === sessionId
            ? {
                ...current,
                currentSession: {
                  ...current.currentSession,
                  session: {
                    ...current.currentSession.session,
                    status: activeBeforeSubmit ? current.currentSession.session.status : "running"
                  }
                },
                sessions: activeBeforeSubmit ? current.sessions : updateSessionListStatus(current.sessions, sessionId, "running"),
                liveAssistant: ""
              }
            : current
        );
        let response: Awaited<ReturnType<typeof api.prompt>>;
        try {
          response = await api.prompt(sessionId, prompt, contentBlocks);
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
        const reconciledDetail = await waitForPromptSessionDetail(sessionId, Boolean(response.queuedPrompt)).catch(
          () => null
        );
        if (reconciledDetail) {
          setState((current) =>
            current.currentSession?.session.id === sessionId
              ? {
                  ...current,
                  currentSession: reconciledDetail,
                  sessions: [
                    sessionDetailToListItem(reconciledDetail),
                    ...current.sessions.filter((item) => item.session.id !== reconciledDetail.session.id)
                  ],
                  liveAssistant: liveAssistantAfterSessionReconcile(current.liveAssistant, reconciledDetail)
                }
              : current
          );
          return;
        }
        setState((current) =>
          current.currentSession?.session.id === sessionId
            ? {
                ...current,
                currentSession: {
                  ...current.currentSession,
                  messages: mergeChatMessage(current.currentSession.messages, response.message),
                  timeline: mergeTimelineItem(current.currentSession.timeline, messageToTimelineItem(response.message)),
                  queuedPrompts: response.queuedPrompts ?? current.currentSession.queuedPrompts,
                  activeTurn:
                    response.activeTurn === undefined ? current.currentSession.activeTurn : response.activeTurn
                },
                sessions:
                  response.queuedPrompts !== undefined
                    ? current.sessions.map((item) =>
                        item.session.id === sessionId
                          ? { ...item, queuedPromptCount: response.queuedPrompts?.length ?? 0 }
                          : item
                      )
                    : current.sessions,
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
        rememberWorkspaceAgent(detail.workspace.id, detail.session.agentId);
        setState((current) => ({
          ...current,
          currentSession: detail,
          currentWorkspaceId: detail.workspace.id,
          currentAgentId: detail.session.agentId,
          sessions: [
            sessionDetailToListItem(detail),
            ...current.sessions.filter((item) => item.session.id !== detail.session.id)
          ],
          liveAssistant: ""
        }));
        await router.navigate(createRestoredSessionDetailRouteTarget(detail));
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

  const cancelApproval = useCallback(async (options?: { clearQueuedPrompts?: boolean }) => {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const detail = await api.cancelSession(sessionId, options);
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

  const updateCurrentSessionTitle = useCallback(
    async (title: string) => {
      const sessionId = state.currentSession?.session.id;
      if (!sessionId) return;
      await runBusy(async () => {
        const detail = await api.updateSession(sessionId, { title });
        setState((current) => replaceSessionInState(current, detail));
      });
    },
    [runBusy, state.currentSession?.session.id]
  );

  const deleteCurrentSession = useCallback(async () => {
    const session = state.currentSession?.session;
    const workspace = state.currentSession?.workspace;
    if (!session || !workspace) return;
    await runBusy(async () => {
      const deleted = await api.deleteSession(session.id);
      setState((current) => removeSessionFromState(current, deleted));
      localStorage.removeItem("currentSessionId");
      await router.navigate({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: workspace.id }
      });
    });
  }, [runBusy, state.currentSession?.session, state.currentSession?.workspace]);

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
    setState((current) => ({
      ...current,
      currentWorkspaceId: workspaceId,
      currentAgentId: null
    }));
  }, []);

  const setCurrentWorkspaceAgent = useCallback((workspaceId: string, agentId: string | null) => {
    localStorage.setItem("currentWorkspaceId", workspaceId);
    const navigation = agentId
      ? rememberWorkspaceAgent(workspaceId, agentId)
      : forgetWorkspaceAgent(workspaceId);
    setState((current) => ({
      ...current,
      currentWorkspaceId: workspaceId,
      currentAgentId: agentId,
      currentAgentIdByWorkspace: navigation.currentAgentIdByWorkspace
    }));
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
        deleteCurrentSession,
        deleteWorkspace,
        loadSession,
        loadSessionList,
        openDiffFallback,
        openReviewArtifact,
        resolvePermission,
        restoreSession,
        sendPrompt,
        setSessionConfigOption,
        updateCurrentSessionTitle,
        updateWorkspace,
        setActiveReview: (artifact) => setState((current) => ({ ...current, activeReview: artifact })),
        setCurrentWorkspace,
        setCurrentWorkspaceAgent
      },
      selectedWorkspace,
      state
    }),
    [
      cancelApproval,
      createSession,
      createWorkspace,
      deleteCurrentSession,
      deleteWorkspace,
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
      setCurrentWorkspaceAgent,
      state,
      updateCurrentSessionTitle,
      updateWorkspace
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
