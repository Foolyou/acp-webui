## Context

The backend already persists workspaces and sessions in SQLite and exposes creation/list/detail APIs. Workspace deletion is indirectly supported by database foreign keys, but there are no explicit user-facing management APIs for updating workspace metadata, deleting workspaces, or managing persisted database sessions. Sessions also have related local records such as messages, tool calls, permission requests, review artifacts, queued prompts, prompt templates, launch profile summaries, active turn metadata, and restore state.

The current `session-list` capability is a workspace-agent-scoped projection used for navigation and realtime freshness. This change must add management behavior without changing that projection's payload contract or ordering rules.

## Goals / Non-Goals

**Goals:**

- Provide explicit backend CRUD operations for workspace records.
- Provide explicit backend CRUD operations for persisted database session records.
- Preserve active agent runtime safety by refusing destructive management actions when a session has active work, pending approval, or queued prompts.
- Keep `session/list` and workspace-agent session list projections behaviorally compatible.
- Add browser management affordances for reading, editing, and deleting workspaces and database-backed sessions.

**Non-Goals:**

- Do not add ACP-native session mutation or deletion; these operations manage local database records only.
- Do not change prompt submission, session restore, permission resolution, or active runtime turn semantics.
- Do not add bulk import/export or administrative database editing beyond scoped workspace/session fields.
- Do not change the `session/list` row schema except for normal absence or updated metadata caused by explicit CRUD operations.

## Decisions

1. Add dedicated REST-style management routes next to existing APIs.

   Use `GET/PATCH/DELETE /api/workspaces/{workspaceId}` for workspace management and `PATCH/DELETE /api/sessions/{sessionId}` for persisted session management. Existing `POST /api/workspaces`, `POST /api/workspaces/{workspaceId}/sessions`, `GET /api/workspaces/{workspaceId}/agents/{agentId}/sessions`, `GET /api/sessions`, and `GET /api/sessions/{sessionId}` keep their current semantics.

   Alternative considered: overload existing create/detail endpoints with optional management behavior. Dedicated verbs keep management intent clear and make destructive operations easier to audit and test.

2. Keep updates metadata-only.

   Workspace updates allow display name changes and, if supported safely, path replacement after filesystem validation. Session updates allow local metadata such as title, display title, status override only where non-active, and management notes if introduced. They do not rewrite timeline content or ACP identifiers through the initial UI.

   Alternative considered: full row editing for every session column. That would expose fragile implementation details and make it easy to corrupt runtime continuity.

3. Use storage transactions for destructive operations.

   Session deletion should explicitly delete the session row in a transaction and rely on existing foreign keys for dependent local records, with tests proving messages, tool calls, approvals, review artifacts, queued prompts, and related rows disappear. Workspace deletion should delete the workspace row only after validating every related session is safe to remove; cascading then removes scoped sessions and prompt templates.

   Alternative considered: mark rows as archived or hidden. Hard deletion matches the requested CRUD semantics and avoids changing list filters, while a future archive feature can still be proposed separately.

4. Refuse destructive operations for active or blocked sessions.

   A session cannot be deleted while it has running/stopping active-turn metadata, pending permission requests, or queued prompts. A workspace cannot be deleted if any contained session fails the same safety checks. The browser should surface the blocking reason and direct the user to stop or resolve the session first.

   Alternative considered: automatically cancel active work before deletion. That couples record management to runtime control and risks losing user-visible context unexpectedly.

5. Publish existing list invalidation events after successful management changes.

   After create, update, or delete, the backend publishes enough existing realtime invalidation for visible workspace-agent session lists to refresh. It should not invent a new `session/list` payload. If the current Session Detail is deleted, the browser navigates back to the owning workspace-agent session list and shows a readable deleted state.

   Alternative considered: patch every visible list row in-place with a new management event. Refreshing scoped lists reuses current code paths and lowers compatibility risk.

## Risks / Trade-offs

- Accidental loss of local history -> Use confirmation UI, backend safety checks, and storage tests that verify deletion scope.
- Workspace delete can cascade more data than expected -> Return a preview/count of sessions that would be deleted before confirmation or include those counts in the confirmation response path.
- Runtime state and database state can diverge -> Refuse deletion for active, stopping, approval-blocked, or queued sessions and unregister deleted idle sessions from runtime maps where applicable.
- Updating workspace paths can break native session continuity -> Validate new paths and initially restrict path changes to idle/view-only database state if continuity risk is high.
- Existing list code may assume deleted current session remains loadable -> Add frontend state handling for 404/deleted current session and scoped list refresh after management events.
