import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAppContext } from "../app/context";
import { workspaceSessionsRouteTarget } from "../app/workspaceAgentNavigation";
import { LoadingPanel, PageHeader } from "../components/common";
import { AgentsStatusPane } from "../features/agents/AgentsStatusPane";
import { InboxPane } from "../features/sessions/InboxPane";
import { NewSessionComposePane } from "../features/sessions/NewSessionComposePane";
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
      const target = workspaceSessionsRouteTarget(state.currentWorkspaceId);
      void navigate({
        ...target,
        replace: true
      });
      return;
    }
    void navigate({ to: "/workspaces", replace: true });
  }, [navigate, state.agents, state.currentWorkspaceId, state.initialized]);

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

export function SettingsRoute() {
  return (
    <div className="page-surface">
      <PageHeader eyebrow="Settings" title="Settings" description="Controller settings are managed from this route." />
    </div>
  );
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
      <WorkspaceList
        agents={state.agents}
        busy={state.busy}
        inbox={state.inbox}
        onDeleteWorkspace={actions.deleteWorkspace}
        onUpdateWorkspace={actions.updateWorkspace}
        sessions={state.sessions}
        workspaces={state.workspaces}
      />
    </div>
  );
}

export function WorkspaceSessionsRoute() {
  const { workspaceId } = workspaceSessionsRoute.useParams();
  const navigate = useNavigate();
  const { actions, state } = useAppContext();
  const { loadSessionList, setCurrentWorkspace } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    setCurrentWorkspace(workspaceId);
    void loadSessionList(workspaceId);
  }, [loadSessionList, setCurrentWorkspace, workspaceId]);

  return (
    <SessionsPane
      agents={state.agents}
      loading={state.sessionsLoading}
      onSelectAgent={(agentId) =>
        void navigate(
          agentId
            ? {
                to: "/workspaces/$workspaceId/agents/$agentId/sessions",
                params: { workspaceId, agentId }
              }
            : {
                to: "/workspaces/$workspaceId/sessions",
                params: { workspaceId }
              }
        )
      }
      selectedAgentId={null}
      sessions={state.sessions}
      workspace={workspace}
    />
  );
}

export function WorkspaceAgentSessionsRoute() {
  const { agentId, workspaceId } = workspaceAgentSessionsRoute.useParams();
  const navigate = useNavigate();
  const { actions, state } = useAppContext();
  const { loadSessionList, setCurrentWorkspaceAgent } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    setCurrentWorkspaceAgent(workspaceId, agentId);
    void loadSessionList(workspaceId);
  }, [agentId, loadSessionList, setCurrentWorkspaceAgent, workspaceId]);

  return (
    <SessionsPane
      agents={state.agents}
      loading={state.sessionsLoading}
      onSelectAgent={(selectedAgentId) =>
        void navigate(
          selectedAgentId
            ? {
                to: "/workspaces/$workspaceId/agents/$agentId/sessions",
                params: { workspaceId, agentId: selectedAgentId }
              }
            : {
                to: "/workspaces/$workspaceId/sessions",
                params: { workspaceId }
              }
        )
      }
      selectedAgentId={agentId}
      sessions={state.sessions}
      workspace={workspace}
    />
  );
}

export function NewSessionRoute() {
  const { workspaceId } = newSessionRoute.useParams();
  const { actions, state } = useAppContext();
  const { setCurrentWorkspace } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    setCurrentWorkspace(workspaceId);
  }, [setCurrentWorkspace, workspaceId]);

  return (
    <NewSessionComposePane
      agents={state.agents}
      busy={state.busy || state.creatingSessionWorkspaceId === workspaceId}
      onCreate={(agentId, permissionMode, launchControlValues, initialPrompt) =>
        actions.createSession(workspaceId, agentId, permissionMode, launchControlValues, initialPrompt)
      }
      workspace={workspace}
      workspaceId={workspaceId}
    />
  );
}

export function NewWorkspaceAgentSessionRoute() {
  const { agentId, workspaceId } = workspaceAgentNewSessionRoute.useParams();
  const { actions, state } = useAppContext();
  const { setCurrentWorkspaceAgent } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    setCurrentWorkspaceAgent(workspaceId, agentId);
  }, [agentId, setCurrentWorkspaceAgent, workspaceId]);

  return (
    <NewSessionComposePane
      agents={state.agents}
      busy={state.busy || state.creatingSessionWorkspaceId === workspaceId}
      onCreate={(_agentId, permissionMode, launchControlValues, initialPrompt) =>
        actions.createSession(workspaceId, agentId, permissionMode, launchControlValues, initialPrompt)
      }
      scopedAgentId={agentId}
      workspace={workspace}
      workspaceId={workspaceId}
    />
  );
}

export function SessionDetailRoute() {
  const { sessionId, workspaceId } = sessionDetailRoute.useParams();
  const { actions, state } = useAppContext();
  const { loadSession, setCurrentWorkspace } = actions;

  useEffect(() => {
    if (state.currentSession?.session.id !== sessionId) {
      setCurrentWorkspace(workspaceId);
      void loadSession(sessionId);
      return;
    }
  }, [
    loadSession,
    sessionId,
    setCurrentWorkspace,
    state.currentSession?.session.id,
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
      onResolvePermission={actions.resolvePermission}
      onSendPrompt={actions.sendPrompt}
      onSetSessionConfigOption={actions.setSessionConfigOption}
      onStopSession={actions.cancelApproval}
      onDeleteSession={actions.deleteCurrentSession}
      onUpdateSessionTitle={actions.updateCurrentSessionTitle}
      transcriptionAvailable={state.transcription.available}
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
      onResolvePermission={actions.resolvePermission}
      onSendPrompt={actions.sendPrompt}
      onSetSessionConfigOption={actions.setSessionConfigOption}
      onStopSession={actions.cancelApproval}
      onDeleteSession={actions.deleteCurrentSession}
      onUpdateSessionTitle={actions.updateCurrentSessionTitle}
      transcriptionAvailable={state.transcription.available}
    />
  );
}
