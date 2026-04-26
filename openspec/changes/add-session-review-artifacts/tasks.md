## 1. Data Model and Storage

- [x] 1.1 Add a SQLite migration for `review_artifacts` with session id, optional tool call id, kind, title, summary, payload JSON, source, and creation timestamp.
- [x] 1.2 Add Rust models and serialization types for review artifact summaries, artifact detail, artifact kinds, and diff fallback responses.
- [x] 1.3 Implement storage methods to create review artifacts, list summaries by session, fetch artifact detail by session and id, and preserve payload JSON round trips.
- [x] 1.4 Extend session detail storage or companion query logic so Session Detail can load review artifact summaries after refresh.
- [x] 1.5 Add storage tests for artifact persistence, session scoping, tool call linking, summary listing, and detail access rejection for the wrong session.

## 2. Backend Review API

- [x] 2.1 Add a session-scoped endpoint to list review artifact summaries for Session Detail.
- [x] 2.2 Add a session-scoped endpoint to fetch one review artifact's full payload for drill-down viewers.
- [x] 2.3 Add an on-demand session diff fallback endpoint that runs `git diff` in the session workspace and returns normalized diff review data.
- [x] 2.4 Handle diff fallback failures with readable errors without changing session status.
- [x] 2.5 Add backend route tests for summary listing, artifact detail scoping, successful diff fallback, and diff fallback error handling.

## 3. ACP Review Evidence Normalization

- [x] 3.1 Extend ACP session update handling to recognize supported non-text updates that can produce review evidence.
- [x] 3.2 Normalize tool call updates into `tool_call` or more specific review artifacts with compact summaries and structured payloads.
- [x] 3.3 Normalize terminal, diff, Markdown, or generic artifact-like updates when those fields are available from `codex-acp`.
- [x] 3.4 Preserve unknown non-interactive updates as tolerated unsupported updates when they cannot be normalized.
- [x] 3.5 Broadcast a realtime review artifact event after persisting an artifact for a known session.
- [x] 3.6 Add ACP runtime tests using fake session updates for supported review evidence and ignored unsupported updates.

## 4. Session Detail UI

- [x] 4.1 Extend frontend API and realtime types for review artifact summaries, detail payloads, and review artifact events.
- [x] 4.2 Load review artifact summaries when loading Session Detail and restore them after browser refresh.
- [x] 4.3 Render compact review artifact cards in the timeline without showing an empty review section when no artifacts exist.
- [x] 4.4 Add a full-screen session-scoped drill-down overlay opened from artifact cards.
- [x] 4.5 Implement mobile unified diff display with changed file navigation and hunk-level navigation.
- [x] 4.6 Implement Markdown preview drill-down with access to raw content.
- [x] 4.7 Implement terminal output drill-down with a compact timeline snippet and full output view.
- [x] 4.8 Keep Review out of primary navigation while ensuring artifact drill-downs preserve the Session Detail conversation context.

## 5. Realtime and Reconnect Behavior

- [x] 5.1 Update the current session state when a review artifact realtime event arrives for the visible session.
- [x] 5.2 Avoid adding duplicate artifact cards when an artifact arrives through realtime and is later reloaded from Session Detail.
- [x] 5.3 Verify browser reconnect or page reload restores review artifact summaries from persisted storage.

## 6. Validation and Documentation

- [x] 6.1 Add Playwright or smoke coverage for a session that receives a review artifact and opens its drill-down.
- [x] 6.2 Add frontend coverage for diff, Markdown, and terminal artifact card rendering.
- [x] 6.3 Add coverage that primary navigation does not expose Review as a first-level destination.
- [x] 6.4 Update product or README documentation if implementation discovers narrower initial support for specific ACP update shapes.
- [x] 6.5 Run OpenSpec validation, backend tests, frontend tests, and relevant Playwright checks.
