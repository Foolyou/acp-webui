## Why

Users lose trust in long-running sessions when completed tool activity disappears from the visible conversation, when they cannot queue a follow-up or stop a mistaken turn, when runtime duration is vague, and when mobile browsers stop receiving updates after app switching. These issues make the web UI feel less reliable than the Codex CLI during active work.

## What Changes

- Preserve completed tool call visibility by grouping consecutive completed tool call timeline items into collapsed blocks that show a count and can be expanded for ordered details.
- Add session prompt queueing so users can submit follow-up messages while work is already running or waiting on approvals, with queued prompts shown in the composer/session state.
- Add an explicit stop control for the current active turn, including backend cancellation semantics and frontend state updates.
- Display clear elapsed working time for active turns, using minute/second phrasing similar to Codex CLI status.
- Make realtime session updates resilient to mobile browser backgrounding by detecting stale or closed WebSocket connections, reconnecting on visibility/network recovery, and reloading missed persisted timeline state.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-timeline-data-model`: Completed tool call items must remain visible through collapsed consecutive groups with expandable detail.
- `workspace-session-chat`: Prompt submission must support queueing during active work, current-turn stopping, elapsed working time, and reliable realtime recovery after reconnect.
- `react-frontend-application`: The React UI must expose grouped tool calls, queued message controls, stop controls, elapsed working time, and mobile-safe realtime reconnection behavior.
- `agent-runtime-management`: Runtime operations must expose and honor stop requests for an active session turn through the owning agent runtime.

## Impact

- Backend session APIs, prompt handling, realtime events, and storage may need additional queue, turn timing, and cancellation state.
- ACP runtime integration needs a defined stop/cancel path or a graceful fallback when an agent does not support cancellation.
- React Session Detail, composer, timeline grouping, and WebSocket lifecycle handling will change.
- Tests should cover grouped completed tool calls, queued prompts, stop behavior, elapsed time display, and mobile visibility/reconnect recovery.
