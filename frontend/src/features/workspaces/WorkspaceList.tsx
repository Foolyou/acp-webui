import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "react-aria-components";
import { workspaceSessionsRouteTarget } from "../../app/workspaceAgentNavigation";
import type { AgentRuntimeStatus, Workspace } from "../../types";

export function WorkspaceList({
  agents,
  busy,
  onDeleteWorkspace,
  onUpdateWorkspace,
  workspaces
}: {
  agents: AgentRuntimeStatus[];
  busy: boolean;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onUpdateWorkspace: (workspaceId: string, update: { name?: string; path?: string }) => Promise<void>;
  workspaces: Workspace[];
}) {
  if (workspaces.length === 0) {
    return <p className="empty">No workspaces yet.</p>;
  }

  return (
    <div className="item-list">
      {workspaces.map((workspace) => {
        const target = workspaceSessionsRouteTarget(workspace.id, agents);
        return <WorkspaceListItem busy={busy} key={workspace.id} onDeleteWorkspace={onDeleteWorkspace} onUpdateWorkspace={onUpdateWorkspace} target={target} workspace={workspace} />;
      })}
    </div>
  );
}

function WorkspaceListItem({
  busy,
  onDeleteWorkspace,
  onUpdateWorkspace,
  target,
  workspace
}: {
  busy: boolean;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onUpdateWorkspace: (workspaceId: string, update: { name?: string; path?: string }) => Promise<void>;
  target: ReturnType<typeof workspaceSessionsRouteTarget>;
  workspace: Workspace;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [path, setPath] = useState(workspace.path);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    await onUpdateWorkspace(workspace.id, { name, path });
    setEditing(false);
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDeleteWorkspace(workspace.id);
  }

  return (
    <div className="list-item workspace-management-row">
      <div className="workspace-management-summary">
        <span className="item-title">{workspace.name}</span>
        <span className="item-path">{workspace.path}</span>
      </div>
      {editing ? (
        <div className="management-form">
          <label>
            <span>Name</span>
            <input aria-label={`Workspace name for ${workspace.name}`} onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <label>
            <span>Path</span>
            <input aria-label={`Workspace path for ${workspace.name}`} onChange={(event) => setPath(event.target.value)} value={path} />
          </label>
          <div className="section-actions">
            <Button className="primary small" isDisabled={busy} onPress={save}>
              Save
            </Button>
            <Button className="secondary small" isDisabled={busy} onPress={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="section-actions">
          <Link className="secondary small workspace-open-link" {...target}>
            Open
          </Link>
          <Button className="secondary small" isDisabled={busy} onPress={() => setEditing(true)}>
            Edit
          </Button>
          <Button className="secondary small danger" isDisabled={busy} onPress={remove}>
            {confirmDelete ? "Confirm delete" : "Delete"}
          </Button>
        </div>
      )}
    </div>
  );
}
