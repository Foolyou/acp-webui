## Context

ACP Web UI can control a local agent process that reads and writes local workspace files. The backend already supports configurable bind host/port and serves both HTTP API routes and a WebSocket route, but it currently has no access control. That is acceptable for `127.0.0.1` development but too broad when the daemon is bound to a LAN, WSL-host, or Tailscale address for mobile use.

The product is local-first and single-user. The first access-control design should prevent accidental network exposure without introducing organization auth, accounts, OAuth, or multi-user authorization.

## Goals / Non-Goals

**Goals:**

- Gate sensitive HTTP API routes and the WebSocket route behind local pairing authentication.
- Let explicitly trusted client IP/CIDR entries bypass pairing for local development and deliberate trusted-device setups.
- Keep the browser experience simple: unpaired users see a pairing view, paired users continue to the existing app.
- Avoid storing the pairing token in frontend-readable JavaScript state.
- Keep the first version compatible with local HTTP deployments.

**Non-Goals:**

- Multi-user login, roles, team sharing, organization authorization, or audit trails.
- Persistent paired-device management UI.
- Tailscale-specific integration.
- Reverse-proxy authentication support or trusting forwarded headers.
- HTTPS certificate provisioning.
- Remembered `allow_always` / `reject_always` permission policy.

## Decisions

### Use pairing token plus HttpOnly session cookie

The daemon will accept a pairing token through a public pairing endpoint. On success, it will issue an opaque browser session cookie. Subsequent browser requests authenticate with that cookie.

Rationale:

- Browser WebSocket connections automatically include same-origin cookies.
- HttpOnly cookies keep the session credential out of frontend JavaScript.
- The model matches the product's single-user local daemon scope.

Alternatives considered:

- Bearer token stored in localStorage: simpler for APIs but weaker against frontend script exposure and awkward for WebSocket.
- HTTP Basic auth: easy to implement, but poorer mobile UX and harder to integrate with app-level pairing state.
- Full user accounts: unnecessary for the first local-first version.

### Generate a token unless explicitly configured

If a pairing token is provided by configuration or environment, the daemon will use it. Otherwise, it will generate a random token at startup and print pairing instructions to the terminal.

The generated token is process-scoped in the first version. Restarting the daemon produces a new token and invalidates in-memory sessions.

Rationale:

- Users can start safely without pre-creating secrets.
- Restart invalidation is acceptable for a local daemon and avoids early persistent device storage.
- Operators who want a stable token can provide one explicitly.

### Protect API and WebSocket routes, not static assets

Static frontend assets remain publicly served so an unpaired browser can load the pairing UI. Sensitive `/api/*` endpoints and `/api/ws` require either a valid session cookie or a trusted client IP, except for explicit public auth endpoints.

Public endpoints:

- `GET /api/auth/status`
- `POST /api/auth/pair`

Protected endpoints include existing workspace, session, inbox, permission, review, app-state, and WebSocket routes.

Rationale:

- This avoids blank unauthenticated pages.
- Sensitive data and actions are behind API/WebSocket auth.
- The frontend can recover from `401` responses by rendering the pairing view.

### Trusted client allowlist uses direct peer IP only

The daemon will support a configured trusted client allowlist containing IP addresses and CIDR ranges. Requests from matching direct peer IPs bypass pairing.

Default trusted clients should include loopback addresses (`127.0.0.1` and `::1`) only. Broader LAN ranges such as `192.168.0.0/16`, `10.0.0.0/8`, and `172.16.0.0/12` must not be trusted by default.

The first version must not trust `X-Forwarded-For` or `Forwarded` headers.

Rationale:

- Loopback bypass keeps local development ergonomic.
- Explicit IP/CIDR allowlisting supports fixed phones, WSL host access, and Tailscale addresses.
- Ignoring forwarded headers prevents trivial spoofing when no trusted proxy model exists.

### Auth state is explicit

The auth status endpoint should tell the frontend whether the current request is:

- `anonymous`
- `paired_session`
- `trusted_ip`

It may also include the observed client IP and whether pairing is required. It must not return the pairing token.

Rationale:

- The frontend can explain why access is allowed or blocked.
- Settings can later display trusted access state.
- Keeping token material server-only avoids accidental disclosure.

### Keep failed pairing responses simple

Invalid pairing attempts return `401 Unauthorized` with a generic error. The backend should apply lightweight process-local rate limiting or backoff for repeated failed attempts by client IP.

Rationale:

- Pairing tokens may be short enough to type on mobile, so brute-force friction matters.
- A simple in-memory limiter fits the local daemon scope.
- Persistent abuse tracking is out of scope.

## Risks / Trade-offs

- [Risk] Trusted IP allowlists can be over-broad and effectively disable auth for a network. -> Mitigation: default only loopback, document examples using single IP or `/32`, and make broad ranges explicit user configuration.
- [Risk] Direct peer IP may be surprising behind reverse proxies or WSL networking. -> Mitigation: document that forwarded headers are ignored in the first version and show the observed client IP in auth status.
- [Risk] Process-scoped browser sessions require re-pairing after restart. -> Mitigation: accept this for the first secure version and leave persistent paired devices for a later change.
- [Risk] Static assets remain public. -> Mitigation: ensure all sensitive data/actions remain behind API and WebSocket auth.
- [Risk] Local HTTP cookies cannot use `Secure`. -> Mitigation: use `HttpOnly`, `SameSite=Lax`, and add `Secure` when the request is HTTPS.

## Migration Plan

1. Add auth configuration with safe defaults.
2. Add auth state and pairing session management to backend startup.
3. Add public auth endpoints and route protection.
4. Update frontend initialization to handle `anonymous` and `401`.
5. Document how to bind safely and configure trusted clients.

Rollback is straightforward during development: run with an explicit development disable-auth option only on loopback, or revert the change before exposing non-loopback bind addresses.

## Open Questions

- Should the generated token be numeric for easy mobile entry, or longer alphanumeric for stronger entropy?
- Should the first version expose a logout/unpair endpoint?
- Should a stable configured token be hidden in logs entirely while generated tokens are printed once?
