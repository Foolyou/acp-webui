## Context

ACP Web UI currently has two different recovery behaviors:

- Browser reload or reconnect can restore persisted projections from SQLite.
- Backend restart loses the in-memory ACP session map, so existing sessions become view-only even when they still have a persisted ACP session id.

That conservative behavior was correct while resume support was unverified. The current ACP protocol defines capability-gated session loading through `loadSession` and newer session lifecycle capabilities such as `sessionCapabilities.list`, `sessionCapabilities.resume`, and `sessionCapabilities.close`. Current Codex ACP also exposes `loadSession` and list support. Other agents such as Claude Code, OpenCode, Gemini CLI, and Cursor CLI have their own resume concepts, but those contracts are not uniform.

The design should therefore treat continuation as a generic agent capability, with ACP as the first-class contract and private CLI/session-file parsing left outside the first implementation.

## Goals / Non-Goals

**Goals:**

- Restore a persisted session's live runtime context when the connected ACP agent advertises a verified load or resume capability.
- Keep prompt submission gated on actual runtime availability, not only the presence of a persisted external session id.
- Preserve reviewability for all persisted sessions, including sessions that cannot be restored.
- Make the backend model compatible with future non-Codex ACP agents.
- Reconcile replayed history from `session/load` with existing local timeline data.
- Expose enough state for the frontend to show clear restore actions, progress, success, and failure.

**Non-Goals:**

- Restoring in-flight JSON-RPC permission responders after backend restart.
- Continuing a turn that was actively running when the backend exited.
- Parsing private Codex, Claude, OpenCode, Gemini, Cursor, or other transcript files.
- Building multi-agent selection beyond the session continuity data model needed by this change.
- Implementing cross-device or cloud session sync.
- Replacing the existing persisted timeline as the UI source of truth.

## Decisions

### Use ACP capability discovery as the primary contract

The backend will parse the `initialize` response and retain agent session capabilities. For this change, the important capabilities are:

- legacy `loadSession`
- `sessionCapabilities.list`
- `sessionCapabilities.resume`
- `sessionCapabilities.close`

The backend will only call `session/load` or `session/resume` when the agent advertises support. Sessions remain view-only otherwise.

Alternative considered: call `session/load` optimistically and handle method-not-found errors. That is worse because ACP explicitly requires clients to check capability fields before calling optional methods, and optimistic calls produce avoidable errors for unsupported agents.

### Prefer `session/load` before no-replay `session/resume`

For the first implementation, `session/load` is the safest restore path because it asks the agent to replay the conversation and proves the session id maps to a real agent-side transcript. `session/resume` can be supported as a later optimization or for agents that advertise only resume, but it must remain a separate code path because it does not replay history.

Alternative considered: implement only `session/resume` as the product concept. That is too narrow for current Codex ACP and loses the useful validation and reconciliation behavior provided by `session/load`.

### Treat continuation state as more detailed than `continuable`

The current boolean `continuable` is not expressive enough. The backend should add a durable continuation state or projection fields that distinguish:

- `live`: local session is already registered in the active runtime.
- `loadable`: session has a persisted external session id and the agent advertises `session/load`.
- `resumable`: session can use `session/resume` when that path is implemented.
- `restoring`: a restore attempt is in progress.
- `restored`: restore succeeded and the session is registered again.
- `view_only`: no verified continuation path is available.
- `restore_failed`: a verified path was attempted but failed.

The API can continue exposing `continuable` for compatibility, but prompt submission should require the effective state to be live/restored, not merely loadable.

Alternative considered: keep `continuable` and infer all details from `viewOnlyReason`. That pushes product state into display text and makes frontend behavior brittle.

### Restore on explicit user action or session open, not at backend startup

The backend should not eagerly restore every persisted session during startup. It should restore when the user opens a session and asks to continue, or when a route-specific policy later decides that opening a loadable session should trigger restore.

This avoids starting many agent-side contexts, prevents replay storms, and keeps failure messages scoped to sessions the user actually cares about.

Alternative considered: auto-load all persisted ACP sessions at startup. That is wasteful, can be slow, and makes startup reliability depend on every historical session still being valid.

### Use local timeline as the UI source of truth and dedupe replayed events

During `session/load`, agents replay history with `session/update` notifications. The backend must normalize these updates through the same pipeline used for live updates, but it must avoid duplicating already persisted messages, tool calls, permissions, and review artifacts.

The first implementation can use deterministic fingerprints based on session id, item kind, role/tool ids, content, status, and timestamp when available. ACP-provided ids such as tool call ids should remain the strongest dedupe keys. For messages without stable ids, the backend can compare ordered role/content pairs against existing history during the restore window.

Alternative considered: clear local timeline and rebuild from agent replay. That risks losing Web UI-only evidence such as failure/system messages, approval expiration notes, and review artifacts created from local fallback behavior.

### Keep expired approvals expired

Pending approvals still expire on backend restart because their JSON-RPC responder ids are process-local. A restored session may continue with a new prompt after the failed turn, but the old approval request should not become actionable unless ACP later defines a durable permission responder contract.

Alternative considered: re-show old pending approvals after `session/load`. That would create UI actions that cannot safely answer the original agent request.

## Risks / Trade-offs

- Replayed history can differ from local projections -> Mitigate by treating local timeline as authoritative for display and using restore replay mainly to rebuild runtime context, while logging/deduping normalized replay updates.
- Some agents advertise `loadSession` but fail for old or moved sessions -> Mitigate with per-session `restore_failed` state and a readable failure reason that preserves view-only history.
- `session/load` can be slow for long histories -> Mitigate with explicit restoring state, no startup bulk load, and eventual support for `session/resume` where available.
- Capability shapes may vary between ACP versions -> Mitigate with tolerant parsing for both legacy `loadSession` and nested `sessionCapabilities`.
- Restore may reconnect MCP servers and reproduce agent-side setup costs -> Mitigate by reusing the same workspace cwd and MCP server configuration used for new sessions.
- More continuity states can complicate the frontend -> Mitigate by keeping backend-derived display flags and clear composer gating.

## Migration Plan

1. Add storage fields for agent identity, external session id, continuation state, restore failure reason, and restore timestamps without removing existing `acp_session_id`.
2. Backfill existing Codex sessions as `view_only` or `loadable` at projection time depending on current runtime capabilities and whether an external session id exists.
3. Add ACP capability parsing and expose it through backend runtime state.
4. Add restore API/runtime flow for `session/load`.
5. Add replay dedupe and tests before enabling prompt submission after restore.
6. Update frontend state and UI labels.

Rollback is straightforward because the existing view-only behavior can remain the fallback. If restore behavior is disabled, persisted sessions continue to render through the existing timeline APIs.

## Open Questions

- Should opening a loadable session automatically attempt restore, or should the user press a dedicated Continue action first?
- Should `session/load` replayed messages be persisted when they reveal agent-side history that ACP Web UI did not already store?
- How should future `session/resume` support expose confidence when no replay occurs?
- Should restore failures be transient in projection state, durable in SQLite, or both?
