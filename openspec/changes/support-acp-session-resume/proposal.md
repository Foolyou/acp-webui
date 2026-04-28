## Why

ACP Web UI already restores persisted session history after reload or backend restart, but those sessions become view-only whenever the live ACP runtime mapping is lost. ACP now defines capability-gated session loading and resumption, and mainstream coding agents increasingly expose resumable session history, so ACP Web UI should support continuation through verified agent contracts instead of treating Codex as a one-off special case.

This change lets users continue eligible persisted sessions while preserving the current safety rule: history is reviewable, but prompt submission is only enabled when the backend has live runtime context or has successfully restored it through a verified agent capability.

## What Changes

- Introduce a generic agent session continuity model that distinguishes live, loadable, resumable, unsupported, failed, and view-only sessions.
- Parse and retain ACP session capabilities from the `initialize` response, including `loadSession`, `sessionCapabilities.resume`, `sessionCapabilities.list`, and related lifecycle capabilities when present.
- Add backend support for restoring a persisted external ACP session id through `session/load` when an agent advertises `loadSession`.
- Leave room for `session/resume` support when an agent advertises `sessionCapabilities.resume`, while treating it as a distinct no-history-replay path from `session/load`.
- Reconcile ACP history replay from `session/load` with locally persisted timeline data without duplicating user prompts, assistant messages, tool calls, approvals, or review evidence.
- Expose continuation metadata and user-facing recovery states through session detail and session list projections.
- Keep sessions view-only when the agent does not advertise a verified load or resume capability, when loading fails, or when the persisted session id cannot be found by the agent.
- Continue expiring pending approvals and in-flight turn state after backend restart unless a future agent contract explicitly supports restoring active JSON-RPC responders or durable running work.
- Keep the first implementation ACP-first and Codex-compatible, without adding private transcript parsing for Codex, Claude, OpenCode, Gemini, Cursor, or other agent-specific storage formats.

## Capabilities

### New Capabilities

- `agent-session-continuity`: Covers generic agent capability discovery, session load/resume eligibility, restored runtime context, replay reconciliation, and view-only fallback behavior.

### Modified Capabilities

- `codex-agent-connection`: Replace the previous "investigate before use" posture with verified ACP `session/load` support for Codex ACP when the adapter advertises the capability.
- `workspace-session-chat`: Allow prompt submission after a persisted session has been successfully restored through a verified agent continuation path, and keep non-restorable sessions view-only.
- `session-list`: Represent sessions that are live, restorable, restoring, restored, failed to restore, or permanently view-only.
- `react-frontend-application`: Surface continuation states and provide the user flow for restoring an eligible persisted session before sending new prompts.

## Impact

- Backend ACP runtime initialization, capability parsing, session lifecycle, and JSON-RPC request handling.
- Storage schema for agent identity, external session ids, continuation state, restore attempts, and possibly replay checkpoints or fingerprints.
- Session detail and session list API responses, including richer continuity metadata.
- Realtime events for restore progress, restore success, restore failure, and timeline updates replayed during load.
- Timeline persistence and deduplication for replayed ACP history.
- React Session Detail, Sessions list, composer gating, loading/error notices, and E2E coverage for backend restart followed by successful and failed restore.
- Product documentation and OpenSpec requirements that currently describe old sessions as view-only unless live runtime context is already available.
