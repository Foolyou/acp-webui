## Context

ACP Web UI currently has the first end-to-end Codex session flow: the backend launches `codex-acp`, creates workspaces and sessions, accepts prompts, streams text updates to the browser, and persists minimal chat history in SQLite.

The current permission behavior is intentionally incomplete. When Codex sends `session/request_permission`, the backend marks the session as blocked by an unsupported permission request and responds to ACP with a cancelled outcome. That protects the connection from crashing, but it prevents the product from supervising real agent work that requires user approval.

The ACP permission model is option-based. The agent sends a tool call plus permission options; the client returns either a selected `optionId` or a cancelled outcome. ACP Web UI should preserve that model instead of inventing an independent allow/reject vocabulary.

## Goals / Non-Goals

**Goals:**

- Persist ACP permission requests durably while they are pending.
- Represent approval as a normal running-turn sub-state: `waiting_approval`.
- Show pending approval prominently in mobile Session Detail.
- Let the user select supported ACP permission options and return the selected `optionId` to Codex.
- Restore pending approvals after browser reload or WebSocket reconnect.
- Add a minimal Inbox projection for sessions waiting on approval.
- Expire pending approvals after backend restart and mark affected sessions as failed.
- Display `allow_always` and `reject_always` options but keep them disabled in this change.

**Non-Goals:**

- No yolo mode.
- No remembered permission policy engine for always options.
- No automatic allow/reject rules.
- No Review page, diff browsing, terminal output, or artifact viewer.
- No multi-agent-specific behavior beyond keeping the data model generic enough for ACP agents.
- No support for multiple simultaneous pending approvals within one session.

## Decisions

### Store raw ACP request details alongside normalized fields

The `permission_requests` table should store query-friendly fields such as local session id, ACP session id, tool call id, title, kind, status, selected option id, and timestamps. It should also store raw `toolCall` and `options` JSON.

ACP structs are extensible, and tool call content can include data the first UI does not yet render. Keeping raw JSON avoids losing protocol information and gives later Review or artifact work a better source of truth.

Alternative considered: only store normalized button labels and text snippets. That would be simpler but would throw away ACP fields that may matter for future agents or UI improvements.

### Use `waiting_approval` instead of `blocked` for active permission requests

A pending approval is not an unrecoverable failure. It is a blocking sub-state of a running prompt turn. The session status should move from `running` to `waiting_approval` when the request is created, then back to `running` after the user selects a supported option.

`blocked` remains available for unsupported or unrecoverable states, but it should not describe normal approval flow.

Alternative considered: keep using `blocked`. That would blur recoverable user attention with error handling and would make the UI less clear.

### Resolve approvals by ACP option id

The backend resolution endpoint should accept a local permission request id plus an ACP `optionId`. The backend validates that the request is pending and that the option exists and is supported, then responds to ACP with:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "<option-id>"
  }
}
```

Cancel behavior should respond with ACP `cancelled` where cancellation is needed, especially if a running prompt turn is cancelled while approval is pending.

Alternative considered: expose separate allow/reject endpoints. That would hide ACP's actual option model and would make `allow_always` or future option kinds awkward.

### Show always options but disable them for MVP

The UI should render `allow_always` and `reject_always` options because the agent may provide them and the user should understand the available ACP choices. The controls are disabled and clearly marked unavailable for now. The backend must also reject attempts to resolve a request with an always option.

This avoids introducing a policy store before the scope and safety model for remembered decisions are designed.

Alternative considered: hide always options. That would simplify the UI but would conceal agent-provided choices and make later behavior appear suddenly.

### Keep pending JSON-RPC replies in memory and expire persisted requests on restart

While the backend process is alive, a permission request needs an in-memory responder keyed by local permission request id or ACP request id. The SQLite record makes browser reconnect durable, but it cannot preserve the live JSON-RPC request across backend restart.

On startup, the backend should mark any previously pending permission requests as `expired` and mark their sessions as `failed` with a clear message. The turn is not safely resumable because the ACP child process and outstanding JSON-RPC request are gone.

Alternative considered: keep pending approvals after restart. That would let the UI show stale approvals that can no longer be delivered to the agent.

### Start Inbox as a narrow projection

Inbox should initially focus on sessions waiting for approval, plus enough context to open the affected Session Detail. It can later grow to failed/interrupted sessions and input-needed states.

Alternative considered: build the full navigation model from the product design now. That would add UI scope before the next cockpit-critical interaction is proven.

## Risks / Trade-offs

- ACP option shapes differ across agents -> Store raw JSON and validate against option ids instead of assuming fixed labels.
- Backend crashes while permission is pending -> Expire the request on next startup and fail the session with a clear message.
- User tries to resolve a stale request -> Return a validation error and do not write to ACP.
- Agent sends multiple pending approvals for one session -> Treat this as unsupported in the first version and fail or reject the second request predictably.
- Disabled always options frustrate users -> Show them transparently but keep the scope honest until policy behavior is designed.
- Browser reconnect races with live events -> Session detail and Inbox endpoints must return current pending approval state, not rely only on WebSocket delivery.

## Migration Plan

Add a SQLite migration for `permission_requests`. On backend startup after the migration, expire any pending permission requests left from a prior process and mark affected sessions as failed.

Rollback during development can remove the local SQLite database. No production migration is required yet because this is still local-first early development.

## Open Questions

- The exact copy for disabled always options can be refined during UI implementation.
- The broader yolo or remembered policy model remains intentionally undecided.
