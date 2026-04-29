## 1. Data Model and Projections

- [x] 1.1 Add storage fields or tables for agent identity, external session id, continuation state, restore failure reason, and restore timestamps while preserving existing session rows.
- [x] 1.2 Add storage helpers to read and update per-session continuation state without coupling callers to raw SQL.
- [x] 1.3 Update session detail projection to include live, loadable, restoring, restored, restore-failed, and view-only continuity metadata.
- [x] 1.4 Update session list projection to include compact restoration state and restore failure metadata.
- [x] 1.5 Keep pending approval expiration behavior intact for sessions that were waiting on approval before backend restart.

## 2. ACP Runtime Continuation

- [x] 2.1 Parse ACP initialization responses for legacy `loadSession` and nested `sessionCapabilities` fields.
- [x] 2.2 Store parsed agent capabilities in the runtime status or a dedicated runtime capability model.
- [x] 2.3 Add a runtime method that determines whether a local session is live, loadable, resumable, or view-only.
- [x] 2.4 Implement `session/load` request support using the persisted external session id, workspace cwd, and configured MCP servers.
- [x] 2.5 Register the restored external session id to the local session id only after `session/load` succeeds.
- [x] 2.6 Record restore failure state and readable failure messages when `session/load` fails.
- [x] 2.7 Leave `session/resume` as a capability-aware extension point without enabling it unless the implementation path is explicitly added.

## 3. Replay Reconciliation

- [x] 3.1 Add a restore/replay mode to ACP update handling so replayed history can be normalized without duplicating existing timeline rows.
- [x] 3.2 Deduplicate replayed messages against existing local role/content timeline entries during a restore window.
- [x] 3.3 Deduplicate replayed tool calls and review artifacts using stable ACP ids where available.
- [x] 3.4 Ensure replayed permission updates never reopen expired pending approvals or make old approval actions selectable.
- [x] 3.5 Add logging for replay items that cannot be matched or safely persisted.

## 4. Backend API and Realtime

- [x] 4.1 Add an authenticated session restore endpoint for eligible persisted sessions.
- [x] 4.2 Reject prompt submissions for sessions that are loadable but not yet restored.
- [x] 4.3 Allow prompt submissions after successful restore when the session is idle and has no pending approvals.
- [x] 4.4 Broadcast restore-started, restore-succeeded, and restore-failed realtime events.
- [x] 4.5 Update app-state, session detail, and session list responses to include restoration metadata consistently.

## 5. React Frontend

- [x] 5.1 Extend frontend types and API helpers for restoration metadata and the restore endpoint.
- [x] 5.2 Render restorable, restoring, restore-failed, restored, and view-only states in Session Detail.
- [x] 5.3 Add a Continue or Restore action for eligible persisted sessions and prevent duplicate restore requests.
- [x] 5.4 Keep the prompt composer disabled until restore succeeds and normal prompt gating allows input.
- [x] 5.5 Update Sessions list rows when restoration state changes through API responses or realtime events.

## 6. Tests and Documentation

- [x] 6.1 Add backend tests for capability parsing and continuity projection.
- [x] 6.2 Add backend tests for successful `session/load`, failed `session/load`, and prompt gating before and after restore.
- [x] 6.3 Add replay reconciliation tests for duplicate messages, tool calls, review artifacts, and expired approvals.
- [x] 6.4 Extend fake ACP fixture to advertise `loadSession` and replay history during `session/load`.
- [x] 6.5 Add Playwright coverage for backend restart, opening a loadable persisted session, restoring it, and sending a follow-up prompt.
- [x] 6.6 Add Playwright coverage for restore failure and view-only fallback.
- [x] 6.7 Update README or product design notes to document ACP-first session continuation and current non-goals.
