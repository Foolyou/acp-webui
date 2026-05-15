import { createRootRouteWithContext, createRoute, createRouter } from "@tanstack/react-router";
import type { AppRouterContext } from "../app/types";
import { initialState } from "../app/types";
import { WorkbenchShell } from "../components/WorkbenchShell";
import {
  AgentsRoute,
  InboxRoute,
  IndexRoute,
  NewSessionRoute,
  SessionDetailRoute,
  WorkspaceSessionsRoute,
  WorkspacesRoute
} from "./RouteComponents";

const noopAsync = async () => {};

export const placeholderContext: AppRouterContext = {
  actions: {
    cancelApproval: noopAsync,
    createSession: noopAsync,
    createWorkspace: noopAsync,
    loadSession: noopAsync,
    loadSessionList: noopAsync,
    openDiffFallback: noopAsync,
    openReviewArtifact: noopAsync,
    resolvePermission: noopAsync,
    restoreSession: noopAsync,
    sendPrompt: noopAsync,
    setSessionConfigOption: noopAsync,
    setActiveReview: () => {},
    setCurrentWorkspace: () => {},
    setCurrentWorkspaceAgent: () => {}
  },
  selectedWorkspace: null,
  state: initialState
};

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: WorkbenchShell
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRoute
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxRoute
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsRoute
});

const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces",
  component: WorkspacesRoute
});

export const workspaceSessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces/$workspaceId/sessions",
  component: WorkspaceSessionsRoute
});

export const newSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces/$workspaceId/sessions/new",
  component: NewSessionRoute
});

export const sessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces/$workspaceId/sessions/$sessionId",
  component: SessionDetailRoute
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  agentsRoute,
  workspacesRoute,
  workspaceSessionsRoute,
  newSessionRoute,
  sessionDetailRoute
]);

export const router = createRouter({ routeTree, context: placeholderContext });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
