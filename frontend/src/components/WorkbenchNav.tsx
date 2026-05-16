import { Link } from "@tanstack/react-router";
import { useAppContext } from "../app/context";
import { workspaceSessionsRouteTarget } from "../app/workspaceAgentNavigation";

export function WorkbenchNav({ onNavigate }: { onNavigate: () => void }) {
  const { state } = useAppContext();
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
        <Link
          activeOptions={{ exact: true }}
          activeProps={{ className: "active" }}
          className="nav-link"
          onClick={onNavigate}
          to="/workspaces"
        >
          Workspaces <span>{state.workspaces.length}</span>
        </Link>
        <Link
          activeOptions={{ exact: true }}
          activeProps={{ className: "active" }}
          className="nav-link"
          onClick={onNavigate}
          to="/settings"
        >
          Settings <span>{state.agents.length}</span>
        </Link>
      </div>
      <div className="nav-section">
        <div className="nav-section-heading">
          <span>Workspace shortcuts</span>
          <small>Open a workspace cockpit.</small>
        </div>
        {state.workspaces.slice(0, 6).map((workspace) => {
          const target = workspaceSessionsRouteTarget(workspace.id);
          return (
            <Link
              activeOptions={{ exact: true }}
              activeProps={{ className: "route-active" }}
              className={`workspace-nav ${workspace.id === state.currentWorkspaceId ? "selected" : ""}`}
              key={workspace.id}
              onClick={onNavigate}
              {...target}
            >
              <strong>{workspace.name}</strong>
              <small>{workspace.path}</small>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
