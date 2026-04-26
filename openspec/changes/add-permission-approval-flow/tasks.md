## 1. Data Model and Storage

- [ ] 1.1 Add a SQLite migration for `permission_requests` with pending, selected, cancelled, and expired states.
- [ ] 1.2 Add Rust models and serialization types for permission requests, options, tool call summaries, and approval resolution requests.
- [ ] 1.3 Implement storage methods to create, fetch, list pending, resolve, cancel, and expire permission requests.
- [ ] 1.4 Extend session detail storage queries to include the current pending permission request and readable failure message when relevant.
- [ ] 1.5 Add storage tests for pending request persistence, option JSON round trips, resolution status transitions, and startup expiration.

## 2. ACP Runtime Permission Flow

- [ ] 2.1 Replace unsupported permission handling with a permission request path that persists the request and waits for user resolution.
- [ ] 2.2 Maintain in-memory pending ACP responders keyed by local permission request id.
- [ ] 2.3 Return ACP selected outcomes using the exact selected `optionId` for supported `allow_once` and `reject_once` options.
- [ ] 2.4 Reject attempts to resolve `allow_always` and `reject_always` options without responding to ACP.
- [ ] 2.5 Cancel or fail duplicate pending approval requests for the same local session predictably.
- [ ] 2.6 Expire pending requests on backend startup and mark affected sessions as failed.
- [ ] 2.7 Add ACP runtime tests using mock permission requests and resolution outcomes.

## 3. Backend API and Realtime Events

- [ ] 3.1 Add an endpoint to resolve a pending permission request by local request id and ACP option id.
- [ ] 3.2 Add cancellation handling for a turn that is waiting on approval, including ACP cancelled permission outcome.
- [ ] 3.3 Add realtime `permission_requested` and `permission_resolved` event variants.
- [ ] 3.4 Broadcast session status transitions into and out of `waiting_approval`.
- [ ] 3.5 Add an Inbox endpoint or app-state projection for sessions with pending approvals.
- [ ] 3.6 Add backend API tests for resolve validation, disabled always options, stale request rejection, reconnect data, and Inbox projection.

## 4. Session Detail UI

- [ ] 4.1 Extend frontend API types for pending permission requests and new realtime events.
- [ ] 4.2 Render `waiting_approval` as a blocking running-turn state in Session Detail.
- [ ] 4.3 Build a mobile approval bottom sheet showing workspace, agent, tool call title, kind, content summary, locations, and ACP options.
- [ ] 4.4 Wire supported `allow_once` and `reject_once` options to the backend resolution endpoint.
- [ ] 4.5 Render `allow_always` and `reject_always` options as disabled controls with unavailable-in-this-version copy.
- [ ] 4.6 Restore the approval bottom sheet after page reload or WebSocket reconnect using session detail data.
- [ ] 4.7 Show expired approval failure messages when a session is failed after backend restart.

## 5. Inbox UI

- [ ] 5.1 Add an Inbox navigation surface to the mobile shell.
- [ ] 5.2 Render a needs-approval group with session, workspace, agent, status, last activity, and approval summary.
- [ ] 5.3 Navigate from an Inbox approval item to the affected Session Detail.
- [ ] 5.4 Update Inbox state from `permission_requested` and `permission_resolved` realtime events.
- [ ] 5.5 Reload the current needs-approval projection after browser refresh.

## 6. Validation and Documentation

- [ ] 6.1 Add end-to-end or smoke coverage for a prompt turn that enters `waiting_approval`, is approved, and resumes.
- [ ] 6.2 Add coverage for reject-once resolution and prompt queue prevention while waiting for approval.
- [ ] 6.3 Add coverage for backend restart expiration behavior.
- [ ] 6.4 Add frontend tests or Playwright checks for the approval bottom sheet, disabled always options, and Inbox item flow.
- [ ] 6.5 Update README limitations and run instructions to describe approval support and remaining yolo/always-policy limitations.
