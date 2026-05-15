## Why

The current workbench treats sessions as a workspace-scoped list and uses agents mainly as creation choices. That model does not fit native ACP session discovery, because an agent owns its own external sessions and may need to be started before its list can be synced.

This change makes the workbench enter a remembered workspace and agent by default, lets users switch agents inside a workspace, and makes the selected agent the scope for session listing, creation, native import, and restoration.

## What Changes

- Add workspace-agent scoped session navigation, with canonical routes that include both workspace id and agent id before session id.
- Restore the last selected agent when entering a workspace, and fall back to the default available agent when no prior selection exists.
- Add an agent switcher on the workspace sessions surface; selecting an idle or failed agent attempts to start the compatible runtime and then loads that agent's sessions for the workspace.
- Add a backend agent-scoped session list flow that starts the selected runtime when needed, calls ACP `session/list` when supported, imports missing native sessions into the local database, and returns only sessions for the selected workspace and agent.
- Keep the database as the local projection/index while using the agent's external session id as the continuation key for imported native sessions.
- Display imported native session metadata such as title and native updated time when the agent provides it.
- Keep restoration explicit: imported native sessions are listed as restorable or view-only according to discovered continuation support, but they are not automatically loaded into a live chat until the user chooses to continue them.
- Preserve compatibility for existing workspace-scoped routes and session records through redirects or fallback handling during the transition.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-workbench-navigation`: Workspace session routes and defaults become workspace-agent scoped.
- `session-list`: Session list loading, filtering, row metadata, realtime freshness, and empty states become scoped to the selected workspace and agent.
- `agent-runtime-management`: Selecting an agent for a workspace session list starts or retries the relevant runtime and keeps runtime state isolated by launch profile.
- `agent-session-continuity`: Native ACP sessions discovered through `session/list` become imported local projections that can later be restored through existing continuation paths.

## Impact

- Backend API: add agent-scoped workspace session list endpoints and likely update existing workspace routes to redirect or delegate to a selected agent.
- Backend storage: add agent-aware list/import helpers, an idempotent uniqueness rule for native external session ids per agent, and title/native timestamp fields for imported sessions.
- Agent runtime: add `session/list` capability parsing and paged list calls, with Codex-native sessions imported by `external_session_id`.
- Frontend routing/state: add current-agent state, workspace-agent session routes, agent switching, and legacy route redirects.
- Frontend UI: update the sessions pane, workbench navigation, new-session flow, and session detail links to preserve workspace and agent context.
- Realtime/events: refresh the visible agent-scoped session list when import or session projection changes affect the current workspace-agent scope.
- Tests: cover route defaults, agent switching, API filtering/import idempotence, and ACP native list sync using the fake ACP process.
