## 1. Backend Storage

- [x] 1.1 Add SQLite migration fields for session title, native updated timestamp, import source metadata, and idempotent `(agent_id, external_session_id)` native imports.
- [x] 1.2 Add storage models and helpers for workspace-agent session listing and native session import/update.
- [x] 1.3 Preserve existing session list projections while adding title and native metadata to session list rows.
- [x] 1.4 Add storage tests for workspace-agent filtering, duplicate external ids across agents, import idempotence, and metadata updates.

## 2. ACP Runtime Sync

- [x] 2.1 Add ACP `session/list` capability parsing and request/response models.
- [x] 2.2 Implement paged native session list calls filtered by workspace cwd when the agent supports listing.
- [x] 2.3 Add an agent runtime manager sync helper that starts or retries the selected compatible runtime and imports native sessions before list projection.
- [x] 2.4 Add fake ACP and backend tests for list support, unsupported list capability, paging, startup failure, and repeated sync idempotence.

## 3. Backend API

- [x] 3.1 Add `GET /api/workspaces/{workspaceId}/agents/{agentId}/sessions` with runtime sync and workspace-agent filtering.
- [x] 3.2 Update session creation and response helpers so new sessions and imported sessions preserve selected workspace-agent route context.
- [x] 3.3 Preserve or delegate legacy workspace-scoped session list behavior for old clients during migration.
- [x] 3.4 Emit a scoped list-refresh event when import or session projection changes affect a workspace-agent list.

## 4. Frontend Routing And State

- [x] 4.1 Add current-agent navigation state stored separately from last session creation profile state.
- [x] 4.2 Add canonical workspace-agent session list, new session, and session detail routes.
- [x] 4.3 Redirect legacy workspace session routes to the remembered or default agent route.
- [x] 4.4 Update workbench navigation and workspace shortcuts to enter the remembered workspace-agent sessions route.

## 5. Frontend Sessions UX

- [x] 5.1 Add an agent switcher to the workspace Sessions surface and load the selected agent's list on change.
- [x] 5.2 Update session rows and empty states to use selected-agent scope and display native title metadata when available.
- [ ] 5.3 Update new-session flow to create sessions under the selected workspace and agent.
- [ ] 5.4 Update Session Detail links, return navigation, and restore controls to preserve workspace-agent route context.
- [ ] 5.5 Apply scoped realtime list-refresh events without showing sessions from unselected agents.

## 6. Validation

- [ ] 6.1 Run OpenSpec validation for `scope-sessions-by-workspace-agent`.
- [ ] 6.2 Run Go backend tests.
- [ ] 6.3 Run frontend unit tests.
- [ ] 6.4 Run frontend lint/build checks.
- [ ] 6.5 Run or update browser automation coverage for route defaults, agent switching, and imported native sessions.
