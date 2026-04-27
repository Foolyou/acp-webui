import { Link } from "@tanstack/react-router";
import { useAppContext } from "../app/context";

export function WorkbenchNav({ onNavigate }: { onNavigate: () => void }) {
  const { state } = useAppContext();
  const currentWorkspaceId = state.currentWorkspaceId ?? state.workspaces[0]?.id ?? "";
  return (
    <nav className="nav-stack">
      <Link activeProps={{ className: "nav-link active" }} className="nav-link" onClick={onNavigate} to="/inbox">
        Inbox <span>{state.inbox.length}</span>
      </Link>
      <Link activeProps={{ className: "nav-link active" }} className="nav-link" onClick={onNavigate} to="/workspaces">
        Workspaces <span>{state.workspaces.length}</span>
      </Link>
      {currentWorkspaceId ? (
        <Link
          activeProps={{ className: "nav-link active" }}
          className="nav-link"
          onClick={onNavigate}
          params={{ workspaceId: currentWorkspaceId }}
          to="/workspaces/$workspaceId/sessions"
        >
          Sessions <span>{state.sessions.length}</span>
        </Link>
      ) : null}
      <div className="nav-section">
        <span>Projects</span>
        {state.workspaces.slice(0, 6).map((workspace) => (
          <Link
            activeProps={{ className: "workspace-nav active" }}
            className="workspace-nav"
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
