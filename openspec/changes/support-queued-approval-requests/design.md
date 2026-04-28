## Context

The current approval model stores many historical permission request rows, but active state is projected as a single `pendingPermission` per session. The ACP runtime also rejects a new `session/request_permission` when any pending request already exists for that local session.

That behavior breaks when Codex starts multiple tool calls close together. The backend can receive multiple permission requests before the user resolves the first one. Rejecting later requests is visible to Codex as a cancelled permission result, but the local session can remain `running` with in-progress tool calls and no actionable UI.

## Goals / Non-Goals

**Goals:**

- Accept and persist multiple pending permission requests for the same live session.
- Preserve an in-memory responder for every live pending ACP permission request.
- Present approvals to the user one at a time in deterministic creation order.
- Keep Session Detail, Inbox, Sessions list, and realtime state coherent while a queue exists.
- Keep prompt submission blocked until the session has no pending permission requests.
- Expire all pending approvals on backend restart, as today, because live responders cannot be restored.

**Non-Goals:**

- No remembered policy engine for `allow_always` or `reject_always`.
- No bulk approve or bulk reject UI.
- No prompt queueing behind a waiting approval.
- No attempt to resume pending JSON-RPC permission responders after backend restart.

## Decisions

### Treat pending approvals as an ordered queue

The backend should persist every permission request for a known live session and order pending requests by `created_at`, with a stable secondary sort by local id if needed.

The first pending request is the active approval shown in the modal. Additional pending requests remain queued and become active after the current request resolves. This preserves deterministic user interaction without adding a multi-modal or batch approval UI.

Alternative considered: render all pending approvals at once. That would expose more context, but it requires more UI surface, more risk around selecting options out of order, and more complex ACP responder handling. A one-at-a-time queue matches the current modal interaction while fixing the correctness issue.

### Keep ACP responders per permission request

The in-memory responder map should continue to be keyed by local permission request id, but the runtime must insert a responder for every accepted queued request. Resolving a request uses that request's responder and removes only that entry.

Alternative considered: pause reading ACP messages while one approval is pending. That would avoid multiple live responders, but it would interfere with normal ACP stream processing and still leaves uncertainty if the agent already emitted multiple JSON-RPC requests.

### Evolve API projections without breaking the initial UI shape unnecessarily

Session detail should expose the full pending approval queue and an active approval. During implementation, `pendingPermission` can remain as a compatibility alias for the active request while adding `pendingPermissions` or `pendingApprovalCount` for queue-aware UI.

Session list and Inbox should keep showing one row per session. The row should summarize the active approval and expose a count when more approvals are queued.

Alternative considered: one Inbox row per pending permission request. That makes each request individually addressable, but it can duplicate the same session in navigation and makes mobile flows noisier. One session row with queue summary fits the existing Inbox model.

### Resolve one approval, then continue waiting if more remain

After the user resolves an approval, the backend should check whether another pending request remains for the same session. If another request exists, the session remains `waiting_approval` and browsers receive state that shows the next active approval. Only when the queue is empty should the session return to `running`.

Alternative considered: always set the session to `running` immediately after any approval resolves. That is the current behavior and is incorrect when additional approvals are already queued.

## Risks / Trade-offs

- Multiple queued approvals may refer to tool calls that Codex has already cancelled internally -> The UI still lets the user resolve the live JSON-RPC request; if the responder fails, the backend should fail the affected request and surface a readable error.
- Queue ordering may not match the user's mental model when tool calls started in parallel -> Ordering by received time is deterministic and avoids guessing dependency order.
- Existing clients only understand `pendingPermission` -> Keep a compatibility active request while adding queue-aware fields.
- Backend restart loses responder state for every queued request -> Preserve the current startup expiry behavior and apply it to all pending requests.
