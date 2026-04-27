## Why

ACP Web UI is intended to be opened from a mobile browser while controlling a local agent process, so binding the daemon to a LAN or Tailscale address without access control is too broad for the first usable product. Pairing token authentication provides a lightweight local-first gate without turning the app into a multi-user service.

## What Changes

- Add pairing-token based access control for browser access to ACP Web UI.
- Add a trusted client IP/CIDR allowlist so explicitly trusted local addresses can bypass pairing.
- Require authenticated or trusted access for all sensitive `/api/*` endpoints and the WebSocket endpoint.
- Add public pairing endpoints so an unpaired browser can check auth state and submit the pairing token.
- Add frontend pairing flow and 401 handling so mobile users can pair a browser before using the app.
- Add README/product guidance for safe bind-host usage, pairing token configuration, and trusted client configuration.

## Capabilities

### New Capabilities

- `pairing-token-auth`: Controls browser access through pairing token authentication, trusted client IP allowlisting, and authenticated API/WebSocket access.

### Modified Capabilities

- None.

## Impact

- Backend configuration gains pairing token and trusted client settings.
- Backend routing gains auth endpoints and middleware or extractors for API/WebSocket protection.
- App state or auth state APIs expose whether the current browser is anonymous, paired, or trusted by IP.
- Frontend app initialization must handle unauthenticated responses and render a pairing view.
- WebSocket connection behavior must account for unauthenticated browsers.
- Tests need coverage for paired access, trusted IP bypass, unauthenticated rejection, and invalid token handling.
