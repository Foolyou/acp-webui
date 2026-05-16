## Why

Workspace records and persisted session records are currently mostly append-only from the browser's point of view, which makes it hard to correct workspace metadata, remove stale local data, or inspect and maintain database-backed sessions without touching agent runtime flows.
This change adds explicit management capabilities for workspace CRUD and persisted session CRUD while preserving the existing `session/list` projection contract.

## What Changes

- Add backend CRUD APIs for workspace records, including reading one workspace, updating display metadata, and deleting a workspace with safe handling for related sessions.
- Add backend CRUD APIs for persisted database session records, including scoped lookup, metadata updates, and deletion of stored session history and related local records.
- Add browser management flows for editing and deleting workspaces and database-backed sessions with clear confirmation and error states.
- Keep existing session creation, Session Detail loading, prompt submission, restore, and `session/list` behavior unchanged except where they observe records that have been explicitly updated or deleted through the new management APIs.
- Ensure destructive operations refuse or clearly handle sessions with active runtime work, pending approval, or queued prompts.

## Capabilities

### New Capabilities

- `workspace-session-management`: Defines workspace CRUD and persisted database session CRUD behavior, including backend API guarantees, browser management flows, validation, deletion safeguards, and realtime invalidation after management changes.

### Modified Capabilities

- `workspace-session-chat`: Clarifies that existing chat/session runtime flows continue to use their current creation, detail, prompt, restore, and live update contracts even when management APIs exist.

## Impact

- Backend HTTP routes, request/response models, and storage helpers for workspace and persisted session management.
- SQLite persistence behavior for updating workspace metadata and removing sessions plus dependent messages, timeline items, queued prompts, approvals, review artifacts, active turn metadata, and configuration state.
- React workspace and session surfaces for edit/delete/read management affordances.
- Tests for storage CRUD, API validation, delete safeguards, and compatibility with existing workspace-agent session list responses.
