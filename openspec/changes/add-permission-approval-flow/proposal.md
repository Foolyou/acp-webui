## Why

The initial Codex session flow can send prompts and receive text, but it cannot complete turns that request user permission. ACP Web UI needs permission approval next because supervision is a core cockpit job and the current unsupported-permission path blocks real agent work.

## What Changes

- Add durable permission request handling for ACP `session/request_permission` calls.
- Add a `waiting_approval` session state that represents a running turn blocked on user approval.
- Add browser-facing APIs and realtime events for pending permission requests and resolution.
- Add a mobile Session Detail approval bottom sheet with ACP-provided permission options.
- Add a minimal Inbox surface that prioritizes sessions waiting for approval.
- Restore pending approval UI after browser reload or WebSocket reconnect.
- Expire pending approvals on backend restart and mark affected sessions as failed.
- Show `allow_always` and `reject_always` options in the UI but keep them disabled for this change.
- Keep yolo mode, remembered permission policies, Review, diffs, terminal output, and multi-agent behavior out of scope.

## Capabilities

### New Capabilities

- `agent-permission-approval`: Covers durable ACP permission requests, user option selection, approval resolution back to the agent, reconnect restoration, disabled always options, and restart expiration behavior.
- `session-inbox`: Covers the initial Inbox projection for sessions that need user attention, starting with pending approvals.

### Modified Capabilities

- `codex-agent-connection`: Replace the current unsupported permission behavior with live permission request forwarding and resolution through ACP.
- `workspace-session-chat`: Extend session state behavior so prompt turns can enter and leave `waiting_approval` without accepting queued prompts.

## Impact

- Adds SQLite persistence for permission requests.
- Extends session status values and session detail responses.
- Adds backend approval resolution endpoints and realtime event payloads.
- Changes Codex ACP runtime behavior for `session/request_permission`.
- Adds mobile UI state for approval bottom sheets and minimal Inbox navigation.
- Adds tests for permission persistence, ACP response mapping, reconnect restoration, disabled always options, and restart expiration.
