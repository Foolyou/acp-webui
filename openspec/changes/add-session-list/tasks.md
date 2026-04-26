## 1. Backend Projection and API

- [ ] 1.1 Define a session list item DTO containing session, workspace, status, last activity, pending approval, and review availability fields
- [ ] 1.2 Add storage query support for listing persisted sessions ordered by most recent activity
- [ ] 1.3 Join or derive pending approval summary data for session list rows
- [ ] 1.4 Join or derive review artifact availability for session list rows without loading artifact payloads
- [ ] 1.5 Add a `GET /api/sessions` route that returns the session list projection

## 2. Frontend Sessions Surface

- [ ] 2.1 Add TypeScript models and API client support for session list rows
- [ ] 2.2 Change primary React navigation from Inbox/Session to Inbox/Sessions while keeping Session Detail reachable
- [ ] 2.3 Implement the Sessions list view with loading, empty, and error states
- [ ] 2.4 Render compact mobile session rows with workspace, agent, status, last activity, approval, and review availability indicators
- [ ] 2.5 Open Session Detail from a selected session row using the existing session detail API
- [ ] 2.6 Provide an empty-state path for creating or selecting a workspace and starting a new session

## 3. Realtime Updates

- [ ] 3.1 Update visible session list rows when `session_status` WebSocket events arrive
- [ ] 3.2 Update pending approval indicators when permission requested or resolved events arrive
- [ ] 3.3 Update review availability indicators when review artifact events arrive
- [ ] 3.4 Refresh or reconcile the list when entering the Sessions surface so stale rows recover after reconnect

## 4. Tests and Documentation

- [ ] 4.1 Extend Playwright E2E coverage to create multiple sessions and open one from the Sessions list
- [ ] 4.2 Add E2E coverage for pending approval and review availability indicators in the Sessions list
- [ ] 4.3 Update README endpoint and current scope documentation for the Sessions list
- [ ] 4.4 Run `cargo build`, `npm run build`, `npm run lint`, and `npm run e2e`
