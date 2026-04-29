## Why

Codex can issue more than one permission request during the same turn, especially when it starts multiple tool calls close together. The current single pending approval model rejects later requests, which can leave the session stuck in `running` with no visible approval UI or final result.

This change makes permission handling match the user expectation: each requested permission should be shown to the user and resolved, even when multiple requests arrive before the first one has been answered.

## What Changes

- Replace the single pending approval assumption with an ordered pending approval queue per session.
- Persist every ACP permission request that belongs to a known live session instead of rejecting later requests because another request is pending.
- Present the active pending approval in Session Detail and continue to the next queued request after the user resolves the current one.
- Keep session, Inbox, and Sessions list projections accurate when a session has one or more queued approvals.
- Prevent prompt submission while any approval in the current turn is pending.
- Expire all pending queued approvals on backend restart because their live JSON-RPC responders cannot be restored.
- Preserve existing disabled behavior for `allow_always` and `reject_always` options.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-permission-approval`: Replace the one-pending-approval contract with ordered queued approvals for a session.
- `workspace-session-chat`: Return approval queue state in session detail and keep prompt gating tied to any pending approval.
- `session-inbox`: Represent sessions with one or more queued approvals in the needs-approval projection.
- `session-list`: Summarize queued approvals in workspace session list rows.
- `react-frontend-application`: Render and update queued approval state, including showing the next pending request after resolution.

## Impact

- Backend storage and projection code for `permission_requests`, session detail, session list, and Inbox.
- ACP runtime permission responder tracking and permission resolution flow.
- Realtime event handling for permission requested/resolved updates.
- React approval UI, session composer gating, Inbox updates, and Sessions list indicators.
- E2E and backend tests for concurrent or back-to-back permission requests in one session.
