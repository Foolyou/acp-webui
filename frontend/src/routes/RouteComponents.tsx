import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAppContext } from "../app/context";
import { resolveWorkspaceAgentId } from "../app/workspaceAgentNavigation";
import { LoadingPanel, PageHeader } from "../components/common";
import { AgentsStatusPane } from "../features/agents/AgentsStatusPane";
import { CreatingSessionPane } from "../features/sessions/CreatingSessionPane";
import { InboxPane } from "../features/sessions/InboxPane";
import { SessionPane } from "../features/sessions/SessionPane";
import { SessionsPane } from "../features/sessions/SessionsPane";
import { WorkspaceForm } from "../features/workspaces/WorkspaceForm";
import { WorkspaceList } from "../features/workspaces/WorkspaceList";
import {
  newSessionRoute,
  sessionDetailRoute,
  workspaceAgentNewSessionRoute,
  workspaceAgentSessionDetailRoute,
  workspaceAgentSessionsRoute,
  workspaceSessionsRoute
} from "./router";

export function IndexRoute() {
  const { state } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.initialized) return;
    if (state.currentWorkspaceId) {
      void navigate({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: state.currentWorkspaceId },
        replace: true
      });
      return;
    }
    void navigate({ to: "/workspaces", replace: true });
  }, [navigate, state.currentWorkspaceId, state.initialized]);

  return <LoadingPanel text="Loading workspace" />;
}

export function InboxRoute() {
  const { actions, state } = useAppContext();
  return <InboxPane inbox={state.inbox} onOpen={(sessionId) => actions.loadSession(sessionId)} />;
}

export function AgentsRoute() {
  const { state } = useAppContext();
  return <AgentsStatusPane agents={state.agents} socketState={state.socketState} />;
}

export function WorkspacesRoute() {
  const { actions, state } = useAppContext();
  return (
    <div className="page-surface">
      <PageHeader
        eyebrow="Workspaces"
        title="Local workspaces"
        description="Create a workspace or reopen one of your existing local workspaces."
      />
      <WorkspaceForm busy={state.busy} onCreateWorkspace={actions.createWorkspace} />
      <WorkspaceList workspaces={state.workspaces} />
    </div>
  );
}

export function WorkspaceSessionsRoute() {
  const { workspaceId } = workspaceSessionsRoute.useParams();
  const navigate = useNavigate();
  const { actions, state } = useAppContext();
  const { createSession, loadSessionList, setCurrentWorkspace, setCurrentWorkspaceAgent } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    const agentId = resolveWorkspaceAgentId(workspaceId, state.agents);
    if (agentId) {
      setCurrentWorkspaceAgent(workspaceId, agentId);
      void navigate({
        to: "/workspaces/$workspaceId/agents/$agentId/sessions",
        params: { workspaceId, agentId },
        replace: true
      });
      return;
    }
    setCurrentWorkspace(workspaceId);
    void loadSessionList(workspaceId);
  }, [loadSessionList, navigate, setCurrentWorkspace, setCurrentWorkspaceAgent, state.agents, workspaceId]);

  return (
    <SessionsPane
      agents={state.agents}
      loading={state.sessionsLoading}
      onCreate={(agentId, permissionMode, launchControlValues) =>
        createSession(workspaceId, agentId, permissionMode, launchControlValues)
      }
      sessions={state.sessions}
      workspace={workspace}
    />
  );
}

export function WorkspaceAgentSessionsRoute() {
  const { agentId, workspaceId } = workspaceAgentSessionsRoute.useParams();
  const { actions, state } = useAppContext();
  const { createSession, loadSessionList, setCurrentWorkspaceAgent } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    setCurrentWorkspaceAgent(workspaceId, agentId);
    void loadSessionList(workspaceId, agentId);
  }, [agentId, loadSessionList, setCurrentWorkspaceAgent, workspaceId]);

  return (
    <SessionsPane
      agents={state.agents}
      loading={state.sessionsLoading}
      onCreate={(selectedAgentId, permissionMode, launchControlValues) =>
        createSession(workspaceId, selectedAgentId, permissionMode, launchControlValues)
      }
      sessions={state.sessions}
      workspace={workspace}
    />
  );
}

export function NewSessionRoute() {
  const { workspaceId } = newSessionRoute.useParams();
  const navigate = useNavigate();
  const { actions, state } = useAppContext();
  const { setCurrentWorkspaceAgent } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;
  const agent = state.agents.find((item) => item.id === state.creatingSessionAgentId) ?? null;

  useEffect(() => {
    const agentId = resolveWorkspaceAgentId(workspaceId, state.agents);
    if (!agentId) return;
    setCurrentWorkspaceAgent(workspaceId, agentId);
    void navigate({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/new",
      params: { workspaceId, agentId },
      replace: true
    });
  }, [navigate, setCurrentWorkspaceAgent, state.agents, workspaceId]);

  return (
    <CreatingSessionPane
      agent={agent}
      creating={state.creatingSessionWorkspaceId === workspaceId}
      permissionMode={state.creatingSessionPermissionMode}
      onRetry={() =>
        actions.createSession(
          workspaceId,
          state.creatingSessionAgentId ?? undefined,
          state.creatingSessionPermissionMode ?? undefined
        )
      }
      workspace={workspace}
    />
  );
}

export function NewWorkspaceAgentSessionRoute() {
  const { agentId, workspaceId } = workspaceAgentNewSessionRoute.useParams();
  const { actions, state } = useAppContext();
  const { createSession, setCurrentWorkspaceAgent } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;
  const agent = state.agents.find((item) => item.id === agentId) ?? null;

  useEffect(() => {
    setCurrentWorkspaceAgent(workspaceId, agentId);
  }, [agentId, setCurrentWorkspaceAgent, workspaceId]);

  return (
    <CreatingSessionPane
      agent={agent}
      creating={state.creatingSessionWorkspaceId === workspaceId}
      permissionMode={state.creatingSessionPermissionMode}
      onRetry={() => createSession(workspaceId, agentId, state.creatingSessionPermissionMode ?? undefined)}
      workspace={workspace}
    />
  );
}

export function SessionDetailRoute() {
  const { sessionId, workspaceId } = sessionDetailRoute.useParams();
  const navigate = useNavigate();
  const { actions, state } = useAppContext();
  const { loadSession, setCurrentWorkspace, setCurrentWorkspaceAgent } = actions;

  useEffect(() => {
    if (state.currentSession?.session.id !== sessionId) {
      setCurrentWorkspace(workspaceId);
      void loadSession(sessionId);
      return;
    }
    const actualWorkspaceId = state.currentSession.workspace.id;
    const actualAgentId = state.currentSession.session.agentId;
    setCurrentWorkspaceAgent(actualWorkspaceId, actualAgentId);
    void navigate({
      to: "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId",
      params: {
        workspaceId: actualWorkspaceId,
        agentId: actualAgentId,
        sessionId
      },
      replace: true
    });
  }, [
    loadSession,
    navigate,
    sessionId,
    setCurrentWorkspace,
    setCurrentWorkspaceAgent,
    state.currentSession?.session.agentId,
    state.currentSession?.session.id,
    state.currentSession?.workspace.id,
    workspaceId
  ]);

  if (!state.currentSession || state.currentSession.session.id !== sessionId) {
    return <LoadingPanel text="Loading session" />;
  }
  const agentStatus =
    state.agents.find((agent) => agent.id === state.currentSession?.session.agentId) ?? null;

  return (
    <SessionPane
      agentStatus={agentStatus}
      busy={state.busy}
      currentSession={state.currentSession}
      liveAssistant={state.liveAssistant}
      onOpenDiffFallback={actions.openDiffFallback}
      onOpenReviewArtifact={actions.openReviewArtifact}
      onRestoreSession={actions.restoreSession}
      onSendPrompt={actions.sendPrompt}
      onSetSessionConfigOption={actions.setSessionConfigOption}
      onStopSession={actions.cancelApproval}
    />
  );
}

export function WorkspaceAgentSessionDetailRoute() {
  const { agentId, sessionId, workspaceId } = workspaceAgentSessionDetailRoute.useParams();
  const navigate = useNavigate();
  const { actions, state } = useAppContext();
  const { loadSession, setCurrentWorkspaceAgent } = actions;

  useEffect(() => {
    if (state.currentSession?.session.id !== sessionId) {
      void loadSession(sessionId);
      return;
    }
    const actualWorkspaceId = state.currentSession.workspace.id;
    const actualAgentId = state.currentSession.session.agentId;
    if (actualWorkspaceId !== workspaceId || actualAgentId !== agentId) {
      setCurrentWorkspaceAgent(actualWorkspaceId, actualAgentId);
      void navigate({
        to: "/workspaces/$workspaceId/agents/$agentId/sessions/$sessionId",
        params: {
          workspaceId: actualWorkspaceId,
          agentId: actualAgentId,
          sessionId
        },
        replace: true
      });
      return;
    }
    setCurrentWorkspaceAgent(workspaceId, agentId);
  }, [
    agentId,
    loadSession,
    navigate,
    sessionId,
    setCurrentWorkspaceAgent,
    state.currentSession?.session.agentId,
    state.currentSession?.session.id,
    state.currentSession?.workspace.id,
    workspaceId
  ]);

  if (!state.currentSession || state.currentSession.session.id !== sessionId) {
    return <LoadingPanel text="Loading session" />;
  }
  if (state.currentSession.workspace.id !== workspaceId || state.currentSession.session.agentId !== agentId) {
    return <LoadingPanel text="Loading session" />;
  }
  const agentStatus =
    state.agents.find((agent) => agent.id === state.currentSession?.session.agentId) ?? null;

  return (
    <SessionPane
      agentStatus={agentStatus}
      busy={state.busy}
      currentSession={state.currentSession}
      liveAssistant={state.liveAssistant}
      onOpenDiffFallback={actions.openDiffFallback}
      onOpenReviewArtifact={actions.openReviewArtifact}
      onRestoreSession={actions.restoreSession}
      onSendPrompt={actions.sendPrompt}
      onSetSessionConfigOption={actions.setSessionConfigOption}
      onStopSession={actions.cancelApproval}
    />
  );
}
