## 1. Backend Approval Queue

- [x] 1.1 Replace single-pending permission lookup usage with ordered pending approval queue helpers.
- [x] 1.2 Persist additional `session/request_permission` requests for a session even when another approval is already pending.
- [x] 1.3 Track one live ACP responder per pending permission request and remove only the resolved or cancelled responder.
- [x] 1.4 After resolving one approval, keep the session in `waiting_approval` when another pending request remains and expose that request as active.
- [x] 1.5 Cancel or expire all pending approvals for a session when the turn is cancelled or the backend restarts.

## 2. API Projections

- [x] 2.1 Extend session detail to expose the active approval plus queued approval metadata.
- [x] 2.2 Extend Inbox projection to summarize active approval and queued approval count per session.
- [x] 2.3 Extend session list projection to summarize active approval and queued approval count.
- [x] 2.4 Keep prompt submission blocked while any pending approval exists for the session.

## 3. Frontend State And UI

- [x] 3.1 Update TypeScript models for queued approvals while preserving the active approval path used by the modal.
- [x] 3.2 Update realtime reducers so `permission_requested` appends or updates queued approval state and `permission_resolved` advances to the next active approval.
- [x] 3.3 Update ApprovalSheet and SessionPane to show the active request and queued approval count.
- [x] 3.4 Update Inbox and Sessions list indicators to avoid duplicate session rows while showing queued approval count.

## 4. Verification

- [x] 4.1 Add backend tests for multiple permission requests arriving before the first is resolved.
- [x] 4.2 Add backend tests for resolving queued approvals in order and returning to `running` only after the final approval resolves.
- [x] 4.3 Add frontend or E2E coverage for consecutive approval popups in one session.
- [x] 4.4 Run `cargo test`, `npm run build`, and `npm run e2e`.
