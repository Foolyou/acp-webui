import { Link } from "@tanstack/react-router";
import type { Workspace } from "../../types";

export function WorkspaceList({ workspaces }: { workspaces: Workspace[] }) {
  if (workspaces.length === 0) {
    return <p className="empty">No workspaces yet.</p>;
  }

  return (
    <div className="item-list">
      {workspaces.map((workspace) => (
        <Link
          className="list-item"
          key={workspace.id}
          params={{ workspaceId: workspace.id }}
          to="/workspaces/$workspaceId/sessions"
        >
          <span className="item-title">{workspace.name}</span>
          <span className="item-path">{workspace.path}</span>
        </Link>
      ))}
    </div>
  );
}
