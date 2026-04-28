## Why

The session chat view currently does not keep the newest conversation content in view, so active Codex turns can continue below the viewport without an obvious way back to the latest message. The browser should follow new messages by default while preserving the user's place when they intentionally scroll upward.

## What Changes

- Add default auto-scroll behavior for the session timeline when new messages, streaming content, or loading/status items appear near the bottom of the conversation.
- Pause automatic scrolling when the user manually scrolls away from the bottom.
- Show a persistent "scroll to bottom" shortcut while auto-scroll is paused and newer content is available below the viewport.
- Restore automatic scrolling after the user reaches the bottom, either by using the shortcut or by manually scrolling back down.
- Keep the behavior local to the browser session detail UI; no backend API or data model changes are expected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-session-chat`: Add browser timeline scroll-follow behavior, paused state, and a shortcut to return to the newest conversation content.

## Impact

- Affected frontend code: session detail timeline container, live update rendering, prompt submission update flow, and related UI state.
- Affected tests: frontend behavior tests for auto-scroll, paused scroll state, shortcut visibility, and restoration of automatic scrolling.
- No expected changes to backend APIs, persistence, ACP integration, or runtime dependencies.
