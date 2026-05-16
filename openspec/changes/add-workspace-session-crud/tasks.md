## 1. Storage Management

- [ ] 1.1 Add storage helpers to get, update, and delete workspace records with validation-friendly errors.
- [ ] 1.2 Add storage helpers to update supported persisted session metadata without mutating immutable runtime identity fields.
- [ ] 1.3 Add session safety checks for active turn state, pending approvals, and queued prompts before destructive operations.
- [ ] 1.4 Add transactional session and workspace deletion helpers that remove dependent local records and preserve unrelated data.

## 2. Backend API

- [ ] 2.1 Add workspace management request/response models and `GET`, `PATCH`, and `DELETE /api/workspaces/{workspaceId}` routes.
- [ ] 2.2 Add persisted session management request/response models and `PATCH` and `DELETE /api/sessions/{sessionId}` routes.
- [ ] 2.3 Publish existing scoped refresh events after successful workspace or session management mutations.
- [ ] 2.4 Ensure management APIs preserve existing session creation, Session Detail, prompt, restore, and session-list projection behavior.

## 3. Frontend Management Flows

- [ ] 3.1 Add typed API client methods for workspace and persisted session management operations.
- [ ] 3.2 Add Workspaces surface affordances to read, edit, and delete workspace records with confirmation and recoverable errors.
- [ ] 3.3 Add persisted session metadata edit and delete affordances from session-facing surfaces.
- [ ] 3.4 Reconcile navigation and local selection when the current workspace or current session is deleted.
- [ ] 3.5 Refresh visible workspace-agent session lists after management updates without adding management-only fields to rows.

## 4. Regression Coverage

- [ ] 4.1 Add storage tests for workspace update/delete and persisted session update/delete cascades.
- [ ] 4.2 Add server tests for management validation, conflict handling, not-found handling, and refresh events.
- [ ] 4.3 Add frontend tests for management success and failure states, including deleted current workspace/session navigation.
- [ ] 4.4 Run OpenSpec validation and focused backend/frontend tests for the management paths.
