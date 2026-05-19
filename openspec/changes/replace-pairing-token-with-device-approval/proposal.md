## Why

The current browser pairing model depends on a daemon-wide pairing token that users copy from the backend terminal into every browser. That shared secret is awkward for remote/mobile access and does not provide explicit device approval, pending request visibility, or durable one-week device authorization.

## What Changes

- **BREAKING**: Remove the pairing-token browser authentication flow, including browser entry of `--pairing-token` / `ACP_WEBUI_PAIRING_TOKEN` secrets as the normal access path.
- Add a device approval pairing flow where anonymous browsers receive a short, grouped, five-minute pairing request code.
- Show a pairing page when the browser has no valid device cookie, an expired device cookie, or a cookie that does not match an approved device.
- Let the pairing page poll public auth endpoints until the request is approved or expires.
- Add single-binary administrative commands to list pending pairing requests and approve a pending request by code.
- After approval, set a secure HttpOnly browser cookie containing a separate one-week device session token.
- Persist approved devices so authorization survives backend restarts until the one-week expiry.

## Capabilities

### New Capabilities
- `device-token-auth`: Browser access control through short-lived device pairing requests, administrator approval, pending request listing, and one-week approved device cookies.

### Modified Capabilities
- `pairing-token-auth`: Replace shared pairing-token authentication requirements with the new device approval model.
- `single-binary-distribution`: Add administrator auth commands to the distributed binary and remove normal release reliance on pairing-token startup configuration.

## Impact

- Backend auth service, auth routes, cookie validation, WebSocket/API access checks, and auth status models.
- SQLite migrations and storage methods for pending pairing requests and approved devices.
- Single-binary command dispatch for `approve` and pending request listing.
- Frontend auth API client, pairing page, unauthorized handling, and auth tests.
- Release/dev/deploy scripts and documentation that currently print or pass pairing tokens.
- Security tests and source checks covering tokens, cookies, expiration, and secret storage.
