## 1. Data Model and Migration

- [x] 1.1 Design Rust response models for normalized timeline items, structured tool calls, session continuity metadata, and workspace-scoped session rows
- [x] 1.2 Add SQLite migrations for tool call persistence and any stable ordering metadata needed by timeline projections
- [x] 1.3 Keep existing message and review artifact data readable while deriving timeline items for pre-existing sessions

## 2. Storage and API Projections

- [x] 2.1 Implement storage queries that return Session Detail with ordered normalized timeline items
- [x] 2.2 Implement workspace-scoped session list queries and route handling
- [x] 2.3 Add `continuable` and `viewOnlyReason` to session detail and list projections
- [x] 2.4 Reject prompt submission for non-continuable sessions with a readable error

## 3. ACP Normalization and Realtime

- [x] 3.1 Normalize ACP tool call and tool call update events into structured tool call records
- [x] 3.2 Link review artifacts to related tool call timeline items when ACP payloads provide a relation
- [x] 3.3 Broadcast realtime timeline item upsert events for tool activity and persisted assistant messages
- [x] 3.4 Preserve unsupported ACP update tolerance without crashing or blocking sessions unnecessarily

## 4. Resume Investigation

- [x] 4.1 Investigate whether `codex-acp` exposes a stable resume method or only `codex resume` exists in the interactive CLI
- [x] 4.2 Document the identifiers required for resume and whether existing `acp_session_id` values can map to Codex transcript context
- [x] 4.3 Keep sessions view-only after restart unless live runtime context or verified resume support is available

## 5. Tests and Verification

- [x] 5.1 Add backend tests for normalized timeline ordering across messages, tool calls, permissions, and review artifacts
- [x] 5.2 Add backend tests for workspace-scoped session list filtering and not-found behavior
- [x] 5.3 Add backend tests for non-continuable prompt rejection
- [x] 5.4 Update frontend TypeScript API models enough to compile against the new backend contract
- [x] 5.5 Run backend tests and frontend build checks affected by the API model changes
