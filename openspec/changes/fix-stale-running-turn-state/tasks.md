## 1. Storage State Repair

- [x] 1.1 Add storage helpers to finalize running assistant messages for a session.
- [x] 1.2 Add storage repair for sessions marked running or stopping without active-turn metadata and without pending approval.
- [x] 1.3 Extend startup repair to invoke the stale running-turn repair.

## 2. Turn Lifecycle

- [x] 2.1 Add a turn-aware permission resolution path that does not mark a session running when active-turn metadata is absent.
- [x] 2.2 Update prompt turn completion, failure, stop, and queued-prompt drain paths to finalize assistant messages with active-turn state.
- [x] 2.3 Ensure prompt submission queues only for pending approval or real active-turn metadata, not stale running status alone.

## 3. Regression Coverage

- [x] 3.1 Add storage tests for stale running-session repair and assistant message finalization.
- [x] 3.2 Add server/runtime tests covering permission resolution with and without active-turn metadata.
- [x] 3.3 Run OpenSpec validation and focused backend tests for the changed lifecycle paths.
