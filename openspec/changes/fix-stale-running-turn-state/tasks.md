## 1. Storage State Repair

- [ ] 1.1 Add storage helpers to finalize running assistant messages for a session.
- [ ] 1.2 Add storage repair for sessions marked running or stopping without active-turn metadata and without pending approval.
- [ ] 1.3 Extend startup repair to invoke the stale running-turn repair.

## 2. Turn Lifecycle

- [ ] 2.1 Add a turn-aware permission resolution path that does not mark a session running when active-turn metadata is absent.
- [ ] 2.2 Update prompt turn completion, failure, stop, and queued-prompt drain paths to finalize assistant messages with active-turn state.
- [ ] 2.3 Ensure prompt submission queues only for pending approval or real active-turn metadata, not stale running status alone.

## 3. Regression Coverage

- [ ] 3.1 Add storage tests for stale running-session repair and assistant message finalization.
- [ ] 3.2 Add server/runtime tests covering permission resolution with and without active-turn metadata.
- [ ] 3.3 Run OpenSpec validation and focused backend tests for the changed lifecycle paths.
