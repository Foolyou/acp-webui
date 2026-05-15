import { Link } from "@tanstack/react-router";
import { workspaceSessionsRouteTarget } from "../../app/workspaceAgentNavigation";
import type { AgentRuntimeStatus, Workspace } from "../../types";

export function WorkspaceList({
  agents,
  workspaces
}: {
  agents: AgentRuntimeStatus[];
  workspaces: Workspace[];
}) {
  if (workspaces.length === 0) {
    return <p className="empty">No workspaces yet.</p>;
  }

  return (
    <div className="item-list">
      {workspaces.map((workspace) => {
        const target = workspaceSessionsRouteTarget(workspace.id, agents);
        return (
          <Link className="list-item" key={workspace.id} {...target}>
            <span className="item-title">{workspace.name}</span>
            <span className="item-path">{workspace.path}</span>
          </Link>
        );
      })}
    </div>
  );
}
