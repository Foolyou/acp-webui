## 1. Storage Management

- [x] 1.1 Add storage helpers to get, update, and delete workspace records with validation-friendly errors.
- [x] 1.2 Add storage helpers to update supported persisted session metadata without mutating immutable runtime identity fields.
- [x] 1.3 Add session safety checks for active turn state, pending approvals, and queued prompts before destructive operations.
- [x] 1.4 Add transactional session and workspace deletion helpers that remove dependent local records and preserve unrelated data.

## 2. Backend API

- [x] 2.1 Add workspace management request/response models and `GET`, `PATCH`, and `DELETE /api/workspaces/{workspaceId}` routes.
- [x] 2.2 Add persisted session management request/response models and `PATCH` and `DELETE /api/sessions/{sessionId}` routes.
- [x] 2.3 Publish existing scoped refresh events after successful workspace or session management mutations.
- [x] 2.4 Ensure management APIs preserve existing session creation, Session Detail, prompt, restore, and session-list projection behavior.

## 3. Frontend Management Flows

- [x] 3.1 Add typed API client methods for workspace and persisted session management operations.
- [x] 3.2 Add Workspaces surface affordances to read, edit, and delete workspace records with confirmation and recoverable errors.
- [x] 3.3 Add persisted session metadata edit and delete affordances from session-facing surfaces.
- [x] 3.4 Reconcile navigation and local selection when the current workspace or current session is deleted.
- [x] 3.5 Refresh visible workspace-agent session lists after management updates without adding management-only fields to rows.

## 4. Regression Coverage

- [x] 4.1 Add storage tests for workspace update/delete and persisted session update/delete cascades.
- [x] 4.2 Add server tests for management validation, conflict handling, not-found handling, and refresh events.
- [x] 4.3 Add frontend tests for management success and failure states, including deleted current workspace/session navigation.
- [x] 4.4 Run OpenSpec validation and focused backend/frontend tests for the management paths.
