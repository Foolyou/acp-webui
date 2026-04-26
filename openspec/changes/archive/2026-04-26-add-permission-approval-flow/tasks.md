## 1. Data Model and Storage

- [x] 1.1 Add a SQLite migration for `permission_requests` with pending, selected, cancelled, and expired states.
- [x] 1.2 Add Rust models and serialization types for permission requests, options, tool call summaries, and approval resolution requests.
- [x] 1.3 Implement storage methods to create, fetch, list pending, resolve, cancel, and expire permission requests.
- [x] 1.4 Extend session detail storage queries to include the current pending permission request and readable failure message when relevant.
- [x] 1.5 Add storage tests for pending request persistence, option JSON round trips, resolution status transitions, and startup expiration.

## 2. ACP Runtime Permission Flow

- [x] 2.1 Replace unsupported permission handling with a permission request path that persists the request and waits for user resolution.
- [x] 2.2 Maintain in-memory pending ACP responders keyed by local permission request id.
- [x] 2.3 Return ACP selected outcomes using the exact selected `optionId` for supported `allow_once` and `reject_once` options.
- [x] 2.4 Reject attempts to resolve `allow_always` and `reject_always` options without responding to ACP.
- [x] 2.5 Cancel or fail duplicate pending approval requests for the same local session predictably.
- [x] 2.6 Expire pending requests on backend startup and mark affected sessions as failed.
- [x] 2.7 Add ACP runtime tests using mock permission requests and resolution outcomes.

## 3. Backend API and Realtime Events

- [x] 3.1 Add an endpoint to resolve a pending permission request by local request id and ACP option id.
- [x] 3.2 Add cancellation handling for a turn that is waiting on approval, including ACP cancelled permission outcome.
- [x] 3.3 Add realtime `permission_requested` and `permission_resolved` event variants.
- [x] 3.4 Broadcast session status transitions into and out of `waiting_approval`.
- [x] 3.5 Add an Inbox endpoint or app-state projection for sessions with pending approvals.
- [x] 3.6 Add backend API tests for resolve validation, disabled always options, stale request rejection, reconnect data, and Inbox projection.

## 4. Session Detail UI

- [x] 4.1 Extend frontend API types for pending permission requests and new realtime events.
- [x] 4.2 Render `waiting_approval` as a blocking running-turn state in Session Detail.
- [x] 4.3 Build a mobile approval bottom sheet showing workspace, agent, tool call title, kind, content summary, locations, and ACP options.
- [x] 4.4 Wire supported `allow_once` and `reject_once` options to the backend resolution endpoint.
- [x] 4.5 Render `allow_always` and `reject_always` options as disabled controls with unavailable-in-this-version copy.
- [x] 4.6 Restore the approval bottom sheet after page reload or WebSocket reconnect using session detail data.
- [x] 4.7 Show expired approval failure messages when a session is failed after backend restart.

## 5. Inbox UI

- [x] 5.1 Add an Inbox navigation surface to the mobile shell.
- [x] 5.2 Render a needs-approval group with session, workspace, agent, status, last activity, and approval summary.
- [x] 5.3 Navigate from an Inbox approval item to the affected Session Detail.
- [x] 5.4 Update Inbox state from `permission_requested` and `permission_resolved` realtime events.
- [x] 5.5 Reload the current needs-approval projection after browser refresh.

## 6. Validation and Documentation

- [x] 6.1 Add end-to-end or smoke coverage for a prompt turn that enters `waiting_approval`, is approved, and resumes.
- [x] 6.2 Add coverage for reject-once resolution and prompt queue prevention while waiting for approval.
- [x] 6.3 Add coverage for backend restart expiration behavior.
- [x] 6.4 Add frontend tests or Playwright checks for the approval bottom sheet, disabled always options, and Inbox item flow.
- [x] 6.5 Update README limitations and run instructions to describe approval support and remaining yolo/always-policy limitations.
