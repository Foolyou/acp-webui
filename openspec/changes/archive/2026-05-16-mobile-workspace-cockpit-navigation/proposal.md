## Why

The current routed session experience still treats agents as primary destinations, while the product direction is a mobile remote controller organized around workspaces. The first screen and workspace entry path need to make project selection, workspace attention, and workspace-scoped session supervision the main flow.

## What Changes

- Make Workspaces the primary entry point and keep workspace cards focused on project selection with lightweight state summaries.
- Replace agent-scoped session navigation as the main path with a workspace cockpit that lists all sessions in the workspace.
- Add workspace cockpit attention for pending approvals, plus composable single-select status and agent filters.
- Render compact session cards with agent, permission mode, status, prompt-derived title, latest activity, and secondary badges.
- Keep the global Inbox approval-focused and use it only as a cross-workspace route into Session Detail.
- Preserve existing agent-specific URLs as compatibility routes, but they must not be the primary navigation model.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-workbench-navigation`: Workspace list -> workspace cockpit -> Session Detail becomes the primary route hierarchy.
- `workspace-session-management`: Workspace cards include lightweight session state summaries without making management actions dominant.
- `session-list`: Workspace session lists become cockpit-style all-agent lists with status and agent filters.
- `session-inbox`: Inbox remains approval-focused and links directly into the relevant Session Detail.

## Impact

- Frontend routing and navigation.
- Workspace list and session list components.
- Session list filtering/sorting helpers and tests.
- No new external dependency.
