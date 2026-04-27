import { Link } from "@tanstack/react-router";
import { useAppContext } from "../app/context";

export function WorkbenchNav({ onNavigate }: { onNavigate: () => void }) {
  const { state } = useAppContext();
  const currentWorkspaceId = state.currentWorkspaceId ?? state.workspaces[0]?.id ?? "";
  return (
    <nav className="nav-stack">
      <div className="nav-group" aria-label="Primary navigation">
        <Link
          activeOptions={{ exact: true }}
          activeProps={{ className: "active" }}
          className="nav-link"
          onClick={onNavigate}
          to="/inbox"
        >
          Inbox <span>{state.inbox.length}</span>
        </Link>
        {currentWorkspaceId ? (
          <Link
            activeProps={{ className: "active" }}
            className="nav-link"
            onClick={onNavigate}
            params={{ workspaceId: currentWorkspaceId }}
            to="/workspaces/$workspaceId/sessions"
          >
            Sessions <span>{state.sessions.length}</span>
          </Link>
        ) : null}
        <Link
          activeOptions={{ exact: true }}
          activeProps={{ className: "active" }}
          className="nav-link"
          onClick={onNavigate}
          to="/workspaces"
        >
          Workspaces <span>{state.workspaces.length}</span>
        </Link>
      </div>
      <div className="nav-section">
        <div className="nav-section-heading">
          <span>Workspace shortcuts</span>
          <small>Jump straight into a workspace session list.</small>
        </div>
        {state.workspaces.slice(0, 6).map((workspace) => (
          <Link
            activeOptions={{ exact: true }}
            activeProps={{ className: "route-active" }}
            className={`workspace-nav ${
              workspace.id === state.currentWorkspaceId ? "selected" : ""
            }`}
            key={workspace.id}
            onClick={onNavigate}
            params={{ workspaceId: workspace.id }}
            to="/workspaces/$workspaceId/sessions"
          >
            <strong>{workspace.name}</strong>
            <small>{workspace.path}</small>
          </Link>
        ))}
      </div>
    </nav>
  );
}
