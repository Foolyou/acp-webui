import { RouterProvider } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppDataContext } from "./app/context";
import {
  applySessionListRealtime,
  clearSessionListPermission,
  sessionDetailToListItem,
  updateSessionListStatus
} from "./app/sessionList";
import { messageToTimelineItem } from "./app/timeline";
import { initialState } from "./app/types";
import type { AppRouterContext, UiState } from "./app/types";
import { api, errorMessage } from "./api";
import { applyRealtimeEvent } from "./realtime";
import { placeholderContext, router } from "./routes/router";
import type { PermissionRequest, RealtimeEvent, SessionDetail } from "./types";

export function App() {
  const [state, setState] = useState<UiState>(initialState);
  const reconnectTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      try {
        const [appState, workspaces, sessions] = await Promise.all([api.appState(), api.workspaces(), api.sessions()]);
        if (cancelled) return;

        const storedWorkspaceId = localStorage.getItem("currentWorkspaceId");
        const storedSessionId = localStorage.getItem("currentSessionId");
        let currentSession: SessionDetail | null = null;

        if (storedSessionId) {
          try {
            currentSession = await api.session(storedSessionId);
          } catch {
            localStorage.removeItem("currentSessionId");
          }
        }

        if (cancelled) return;
        setState((current) => ({
          ...current,
          codex: appState.codex,
          inbox: appState.inbox,
          sessions,
          workspaces,
          currentWorkspaceId: currentSession?.workspace.id ?? storedWorkspaceId ?? workspaces[0]?.id ?? null,
          currentSession,
          initialized: true
        }));
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({ ...current, error: errorMessage(error), initialized: true }));
        }
      }
    }

    loadInitialState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
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
          setState((current) => ({ ...current, codex: message.status }));
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
  }, []);

  const selectedWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId) ?? null,
    [state.currentWorkspaceId, state.workspaces]
  );

  const runBusy = useCallback(async (action: () => Promise<void>) => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      await action();
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
    } finally {
      setState((current) => ({ ...current, busy: false }));
    }
  }, []);

  const loadSessionList = useCallback(async (workspaceId?: string | null) => {
    setState((current) => ({ ...current, sessionsLoading: true, error: null }));
    try {
      const sessions = workspaceId ? await api.workspaceSessions(workspaceId) : await api.sessions();
      setState((current) => ({ ...current, sessions, sessionsLoading: false }));
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error), sessionsLoading: false }));
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    const detail = await api.session(sessionId);
    localStorage.setItem("currentWorkspaceId", detail.workspace.id);
    localStorage.setItem("currentSessionId", detail.session.id);
    setState((current) => ({
      ...current,
      currentSession: detail,
      currentWorkspaceId: detail.workspace.id,
      liveAssistant: ""
    }));
  }, []);

  const createWorkspace = useCallback(async (path: string) => {
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
  }, [runBusy]);

  const createSession = useCallback(async (workspaceId: string) => {
    setState((current) => ({ ...current, creatingSessionWorkspaceId: workspaceId, error: null }));
    await router.navigate({ to: "/workspaces/$workspaceId/sessions/new", params: { workspaceId } });
    try {
      const detail = await api.createSession(workspaceId);
      localStorage.setItem("currentWorkspaceId", detail.workspace.id);
      localStorage.setItem("currentSessionId", detail.session.id);
      setState((current) => ({
        ...current,
        currentSession: detail,
        currentWorkspaceId: detail.workspace.id,
        creatingSessionWorkspaceId: null,
        sessions: [sessionDetailToListItem(detail), ...current.sessions.filter((item) => item.session.id !== detail.session.id)],
        liveAssistant: ""
      }));
      await router.navigate({
        to: "/workspaces/$workspaceId/sessions/$sessionId",
        params: { workspaceId: detail.workspace.id, sessionId: detail.session.id },
        replace: true
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        creatingSessionWorkspaceId: null,
        error: errorMessage(error)
      }));
    }
  }, []);

  const sendPrompt = useCallback(async (prompt: string) => {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const response = await api.prompt(sessionId, prompt);
      setState((current) =>
        current.currentSession
          ? {
              ...current,
              currentSession: {
                ...current.currentSession,
                messages: [...current.currentSession.messages, response.message],
                timeline: [...current.currentSession.timeline, messageToTimelineItem(response.message)],
                session: { ...current.currentSession.session, status: "running" }
              },
              sessions: updateSessionListStatus(current.sessions, sessionId, "running"),
              liveAssistant: ""
            }
          : current
      );
    });
  }, [runBusy, state.currentSession?.session.id]);

  const resolvePermission = useCallback(async (permission: PermissionRequest, optionId: string) => {
    await runBusy(async () => {
      await api.resolvePermission(permission.id, optionId);
      setState((current) =>
        current.currentSession
          ? {
              ...current,
              currentSession: {
                ...current.currentSession,
                pendingPermission: null,
                session: { ...current.currentSession.session, status: "running" }
              },
              sessions: clearSessionListPermission(updateSessionListStatus(current.sessions, permission.sessionId, "running"), permission.sessionId),
              inbox: current.inbox.filter((item) => item.permission.id !== permission.id)
            }
          : current
      );
    });
  }, [runBusy]);

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

  const openReviewArtifact = useCallback(async (artifactId: string) => {
    const sessionId = state.currentSession?.session.id;
    if (!sessionId) return;
    await runBusy(async () => {
      const artifact = await api.reviewArtifact(sessionId, artifactId);
      setState((current) => ({ ...current, activeReview: artifact }));
    });
  }, [runBusy, state.currentSession?.session.id]);

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
        sendPrompt,
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
      selectedWorkspace,
      sendPrompt,
      setCurrentWorkspace,
      state
    ]
  );

  return (
    <AppDataContext.Provider value={context}>
      <RouterProvider context={placeholderContext} router={router} />
    </AppDataContext.Provider>
  );
}
