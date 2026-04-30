## 1. Backend State And APIs

- [x] 1.1 Add storage support for ordered queued prompts, active turn start time, active turn status, and stop request state
- [x] 1.2 Extend session detail/list projections to include queued prompts and active turn timing/state
- [x] 1.3 Update prompt submission so busy or approval-blocked sessions persist prompts in queue instead of rejecting valid input
- [x] 1.4 Implement queued prompt dispatch when a session becomes idle, continuable, and has no pending approvals
- [x] 1.5 Add a session stop endpoint that validates session state and returns readable unavailable reasons

## 2. Agent Runtime And Realtime

- [x] 2.1 Route stop requests through the owning agent runtime only
- [x] 2.2 Implement best-effort ACP cancellation or fallback stop handling for agents without direct cancellation support
- [x] 2.3 Broadcast realtime updates for queued prompt changes, active turn timing/state, stopping/stopped states, and queued prompt dispatch
- [x] 2.4 Ensure reconnect/reload session detail responses reconcile queued prompts, tool calls, approvals, messages, and active turn state by stable ids

## 3. React Session UI

- [x] 3.1 Render consecutive completed tool calls as collapsed groups with count and ordered expandable details
- [x] 3.2 Update the composer to submit busy-session prompts into visible queued state
- [x] 3.3 Add stop controls and stopping/unavailable feedback for active turns
- [x] 3.4 Display elapsed active work time in minutes and seconds from backend turn timing data
- [x] 3.5 Harden WebSocket lifecycle handling for close/error/visibility/online recovery and reload active session detail after reconnect
- [x] 3.6 Verify mobile layout keeps queue, stop, elapsed time, approvals, and timeline controls usable without overlap

## 4. Tests And Validation

- [x] 4.1 Add backend tests for queued prompt creation, dispatch ordering, stop routing, stop unavailable errors, and active turn timing projection
- [x] 4.2 Add frontend tests for completed tool group collapse/expand, queued prompt rendering, stop control states, and elapsed time display
- [x] 4.3 Add or update Playwright coverage for mobile background/reconnect recovery by simulating stale WebSocket or visibility return and verifying missed messages appear without refresh
- [x] 4.4 Run backend tests, frontend tests, frontend build, and relevant Playwright coverage
