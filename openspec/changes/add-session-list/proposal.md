## Why

The product design calls for Sessions as a primary mobile surface, but the current UI only exposes Inbox and a single Session workspace flow. Users need a compact way to see all existing sessions, understand their status, and reopen the right session without relying on browser storage or Inbox-only approval items.

## What Changes

- Add a Sessions primary navigation surface for browsing all persisted sessions.
- Show compact session rows with workspace, agent, current state, last activity, pending approval indication, and review artifact/change availability.
- Allow the user to open a session detail from the Sessions list.
- Keep Inbox focused on items that need attention and keep Review scoped to session detail drill-downs.
- Add backend projection/API support for the Sessions list if existing endpoints do not already expose enough data.
- Update React frontend state and Playwright coverage for the Sessions surface.

## Capabilities

### New Capabilities

- `session-list`: Defines the Sessions surface, session list projection, navigation behavior, and realtime freshness expectations.

### Modified Capabilities

- `react-frontend-application`: Primary navigation changes from Inbox/Session to Inbox/Sessions, while Session Detail remains reachable from the Sessions list, Inbox, and session creation flow.

## Impact

- Affects backend session query/projection code, HTTP API routes, React frontend navigation and state, and browser E2E tests.
- May require adding response DTOs that combine session, workspace, pending approval, and review artifact summary counts.
- Does not change ACP agent communication, prompt submission semantics, permission resolution semantics, or review artifact detail APIs.
