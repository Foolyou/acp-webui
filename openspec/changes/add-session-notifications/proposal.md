## Why

Users may leave ACP Web UI in the background while an agent is working or waiting
for approval. Browser notifications should surface the two urgent milestones in
the first version: a turn completing and a permission request needing action.

## What Changes

- Add opt-in browser notifications for session activity.
- Notify when an active agent turn completes.
- Notify when a permission request is received.
- Keep notification support browser-local and permission-gated.
- Do not introduce server-side push subscriptions or persistent notification
  preferences in the first version.

## Capabilities

### New Capabilities
- `session-browser-notifications`: Browser-local notifications for session turn
  completion and permission requests.

### Modified Capabilities

## Impact

- Frontend notification utility and app realtime integration.
- Frontend UI affordance for enabling notification permission.
- Frontend tests around permission states and notification-triggering events.
- No backend API, storage migration, service worker, or external push provider.
