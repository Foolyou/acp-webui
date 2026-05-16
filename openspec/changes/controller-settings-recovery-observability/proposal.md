## Why

Settings, access visibility, and reconnect recovery are supporting controller concerns. They should not compete with the workspace-first path, but mobile users still need to observe access status, agent status, storage/diagnostics, and recover projections after reloads or network changes.

## What Changes

- Replace the top-level Agents destination with Settings.
- Add Settings sections for Access, Agents, Storage, and Diagnostics.
- Expose observational access information: bind host, port, access URL, auth status, detected exposure mode, and Tailscale Serve URL when available.
- Keep bind mode and Tailscale command execution outside the browser UI.
- Recover current session, workspace session list, inbox, approval, queue, and review projections after reload, reconnect, mobile backgrounding, or network switching.

## Capabilities

### New Capabilities

- `controller-settings-observability`: Read-only controller settings and access observability in the browser UI.

### Modified Capabilities

- `react-frontend-application`: Browser reconnect and visibility recovery reloads the current projections, not only the websocket connection.

## Impact

- App state API and frontend types.
- Settings route, navigation, and Settings UI.
- Reconnect/visibility/online recovery logic.
- Frontend tests and backend API tests for access status.
