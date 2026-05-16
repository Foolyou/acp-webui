## 1. Settings Data

- [x] 1.1 Add access observability data to the app state API and shared types.
- [x] 1.2 Add conservative exposure mode and access URL derivation without executing Tailscale commands.
- [x] 1.3 Add backend tests for access observability data.

## 2. Settings UI

- [x] 2.1 Replace top-level Agents navigation with Settings.
- [x] 2.2 Add Access, Agents, Storage, and Diagnostics sections.
- [x] 2.3 Move existing agent status display under Settings.

## 3. Projection Recovery

- [x] 3.1 Add an app-level recovery helper that reloads app state, workspaces, current workspace session list, and current session detail.
- [x] 3.2 Invoke recovery after websocket open, visibility change, and online events.
- [x] 3.3 Prevent stale recovery responses from overwriting newer route state.

## 4. Verification

- [x] 4.1 Add frontend tests for Settings navigation and access rendering.
- [x] 4.2 Add frontend tests for projection recovery behavior.
- [x] 4.3 Run focused frontend and Go tests for Settings and recovery.
