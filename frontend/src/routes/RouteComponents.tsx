import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAppContext } from "../app/context";
import { LoadingPanel, PageHeader } from "../components/common";
import { CreatingSessionPane } from "../features/sessions/CreatingSessionPane";
import { InboxPane } from "../features/sessions/InboxPane";
import { SessionPane } from "../features/sessions/SessionPane";
import { SessionsPane } from "../features/sessions/SessionsPane";
import { WorkspaceForm } from "../features/workspaces/WorkspaceForm";
import { WorkspaceList } from "../features/workspaces/WorkspaceList";
import { newSessionRoute, sessionDetailRoute, workspaceSessionsRoute } from "./router";

export function IndexRoute() {
  const { state } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.initialized) return;
    const session = state.currentSession;
    if (session) {
      void navigate({
        to: "/workspaces/$workspaceId/sessions/$sessionId",
        params: { workspaceId: session.workspace.id, sessionId: session.session.id },
        replace: true
      });
      return;
    }
    if (state.currentWorkspaceId) {
      void navigate({
        to: "/workspaces/$workspaceId/sessions",
        params: { workspaceId: state.currentWorkspaceId },
        replace: true
      });
      return;
    }
    void navigate({ to: "/workspaces", replace: true });
  }, [navigate, state.currentSession, state.currentWorkspaceId, state.initialized]);

  return <LoadingPanel text="Loading workspace" />;
}

export function InboxRoute() {
  const { actions, state } = useAppContext();
  return <InboxPane inbox={state.inbox} onOpen={(sessionId) => actions.loadSession(sessionId)} />;
}

export function WorkspacesRoute() {
  const { actions, state } = useAppContext();
  return (
    <div className="page-surface">
      <PageHeader eyebrow="Workspaces" title="Local projects" />
      <WorkspaceForm busy={state.busy} onCreateWorkspace={actions.createWorkspace} />
      <WorkspaceList workspaces={state.workspaces} />
    </div>
  );
}

export function WorkspaceSessionsRoute() {
  const { workspaceId } = workspaceSessionsRoute.useParams();
  const { actions, state } = useAppContext();
  const { createSession, loadSessionList, setCurrentWorkspace } = actions;
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    setCurrentWorkspace(workspaceId);
    void loadSessionList(workspaceId);
  }, [loadSessionList, setCurrentWorkspace, workspaceId]);

  return (
    <SessionsPane
      loading={state.sessionsLoading}
      onCreate={() => createSession(workspaceId)}
      sessions={state.sessions}
      workspace={workspace}
    />
  );
}

export function NewSessionRoute() {
  const { workspaceId } = newSessionRoute.useParams();
  const { actions, state } = useAppContext();
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;
  return (
    <CreatingSessionPane
      creating={state.creatingSessionWorkspaceId === workspaceId}
      onRetry={() => actions.createSession(workspaceId)}
      workspace={workspace}
    />
  );
}

export function SessionDetailRoute() {
  const { sessionId, workspaceId } = sessionDetailRoute.useParams();
  const { actions, state } = useAppContext();
  const { loadSession, setCurrentWorkspace } = actions;

  useEffect(() => {
    setCurrentWorkspace(workspaceId);
    if (state.currentSession?.session.id !== sessionId) {
      void loadSession(sessionId);
    }
  }, [loadSession, sessionId, setCurrentWorkspace, state.currentSession?.session.id, workspaceId]);

  if (!state.currentSession || state.currentSession.session.id !== sessionId) {
    return <LoadingPanel text="Loading session" />;
  }

  return (
    <SessionPane
      busy={state.busy}
      codex={state.codex}
      currentSession={state.currentSession}
      liveAssistant={state.liveAssistant}
      onOpenDiffFallback={actions.openDiffFallback}
      onOpenReviewArtifact={actions.openReviewArtifact}
      onSendPrompt={actions.sendPrompt}
    />
  );
}
