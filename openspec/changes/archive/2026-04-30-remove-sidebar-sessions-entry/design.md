## Context

The workbench already routes workspace selection to `/workspaces/$workspaceId/sessions`, and workspace shortcuts in the sidebar jump directly into workspace-scoped session lists. The separate primary Sessions nav entry points to the same type of route for the current workspace, so it duplicates the workspace navigation model instead of adding a distinct surface.

Session Detail currently preserves workspace context in the route, but once the primary Sessions entry is removed, the detail view needs its own obvious way back to the current workspace's session list.

## Goals / Non-Goals

**Goals:**

- Make workspace selection the primary way to enter a workspace session list.
- Remove the standalone Sessions entry from desktop sidebar and mobile navigation.
- Add a compact, route-backed return affordance from Session Detail to the current workspace's session list.
- Preserve all existing session list, session creation, session detail, and deep-link routes.

**Non-Goals:**

- Rename the Sessions surface inside a workspace.
- Change backend session list APIs or workspace/session route shapes.
- Redesign the full sidebar visual system.
- Change Inbox, Agents, or Workspaces primary entries.

## Decisions

1. Keep `/workspaces/$workspaceId/sessions` as the workspace landing route.

   Workspace selection already resolves to the workspace session list, and preserving that route avoids backend or deep-link migration. The alternative was introducing a new workspace overview route, but that would add an extra intermediate screen and delay the user's path to sessions.

2. Remove only the primary Sessions nav entry, not the workspace session list route.

   The problem is duplicate navigation, not the existence of the workspace-scoped Sessions surface. This keeps existing routes, reload behavior, and session creation workflows intact.

3. Add the return affordance inside Session Detail near the session context header.

   The control belongs close to the workspace/session title because it changes the user's location within the current workspace. A global sidebar replacement would be less discoverable on mobile and would reintroduce a second route concept.

4. Treat the return affordance as normal navigation.

   The control should link to `/workspaces/$workspaceId/sessions` rather than mutating local tab state. This keeps browser history, direct links, and mobile navigation behavior predictable.

## Risks / Trade-offs

- Users who relied on the primary Sessions nav entry may need to learn that workspace shortcuts are now the route into session lists. Mitigation: keep workspace shortcut labels explicit and ensure the Workspaces route remains available.
- Removing the nav entry reduces the visible count of current workspace sessions in the primary nav. Mitigation: keep session counts visible on the workspace session list header and preserve row freshness.
- Adding another control to Session Detail can crowd the header. Mitigation: keep it compact and visually secondary, and verify mobile layout.
