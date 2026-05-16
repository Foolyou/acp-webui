## 1. Routing And Navigation

- [x] 1.1 Make the root and workspace card paths open `/workspaces/:workspaceId/sessions` as the canonical cockpit route.
- [x] 1.2 Preserve agent-scoped session routes as compatibility paths that apply an agent filter or redirect to equivalent cockpit state.
- [x] 1.3 Update primary navigation so agents are no longer a top-level destination.

## 2. Workspace List

- [x] 2.1 Add workspace card summary helpers for pending approval, running, failed, and recent activity state.
- [x] 2.2 Update workspace cards so open is primary and edit/delete remain secondary management actions.

## 3. Workspace Cockpit

- [x] 3.1 Load all workspace sessions for the cockpit by default.
- [x] 3.2 Add composable status and agent filters with the required first-version options.
- [x] 3.3 Add pending approval attention count and shortcut behavior.
- [x] 3.4 Redesign session rows as compact cards with agent, permission mode, status, title, last activity, and secondary badges.

## 4. Verification

- [x] 4.1 Add or update frontend unit tests for route behavior, workspace summaries, filters, and card fields.
- [x] 4.2 Run focused frontend tests for workspace, routing, and session list behavior.
