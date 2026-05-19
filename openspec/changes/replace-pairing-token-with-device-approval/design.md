## Context

ACP Web UI currently protects browser access with a daemon-wide pairing token. Anonymous browsers submit that shared token to `/api/auth/pair`, after which the backend creates an in-memory session cookie. This keeps the first version simple, but it makes every browser share the same secret, loses sessions on restart, and provides no explicit view of devices waiting for approval.

The new model needs to remain local-first and single-binary friendly. Browsers should not receive administrator credentials, and administrator approval should work from the binary even when the HTTP API is inaccessible to anonymous clients.

## Goals / Non-Goals

**Goals:**

- Replace shared pairing-token entry with explicit device approval.
- Use a short, grouped, five-minute pairing request code for user-visible approval.
- Keep the approved browser credential separate from the displayed request code.
- Store only hashed approved device tokens server-side.
- Persist approved devices for one week across backend restarts.
- Add administrator commands to list pending requests and approve a request by code.
- Preserve `--disable-auth` behavior for trusted loopback-only deployments.

**Non-Goals:**

- Building multi-user accounts, roles, remote admin login, or cloud synchronization.
- Adding in-app device management beyond the anonymous pairing page.
- Requiring HTTPS for local loopback development.
- Replacing external Nginx Basic Auth deployment mode.

## Decisions

### Use two tokens: short request code and long device credential

Anonymous browsers create a short-lived pairing request and display a grouped code such as `ABCD-EFGH-JKLM`. That code only identifies the pending request and expires after five minutes. Once approved, the polling response sets a separate opaque device session token in an HttpOnly cookie with a one-week lifetime.

Alternative considered: make the displayed code itself the one-week device token. That exposes the durable browser credential to anyone who sees the pairing page or terminal history. A separate long token keeps the visible approval code short-lived and low value after approval.

### Persist auth state in SQLite

Pending requests and approved devices will be stored in the existing application database. The running server checks this database when polling and when validating cookies, and the CLI admin commands open the same database using the existing config/work-dir resolution.

Alternative considered: keep pending and approved device state in process memory. That would make approval commands difficult without adding unauthenticated admin HTTP endpoints, and approved devices would not survive restart.

### Let admin commands write the database directly

The binary will support administrator commands such as `devices pending` and `approve <code>`. These commands resolve the same config and database path as the daemon, run migrations if needed, then list or update auth records directly.

Alternative considered: expose an HTTP admin approval endpoint. That would need a second admin secret or local-only trust rule and would complicate the security model.

### Store hashes for durable device credentials

Approved device records store a SHA-256 hash of the cookie token, not the token itself. Pending request codes are short-lived but should also be stored in normalized form with expiration and approval metadata.

Alternative considered: store plaintext device tokens for simpler lookup. Hashing is cheap and limits database disclosure impact.

### Keep cookie policy compatible with local HTTP

Device cookies will use `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age`/`Expires` for one week. The backend will add `Secure` when the request scheme is HTTPS, but not for local HTTP requests so loopback and Tailscale HTTP access continue to work.

Alternative considered: always set `Secure`. That is stronger for HTTPS deployments but breaks local HTTP, which is a supported first-class use case.

## Risks / Trade-offs

- Short approval codes have less entropy than long random tokens -> Codes expire in five minutes, are generated from enough random bytes for the configured format, and approval requires database access through the administrator binary.
- Database access by CLI while the server is running can encounter SQLite contention -> Approval updates are small, transactional writes and should use normal SQLite busy handling if the existing storage layer supports it.
- Users may approve the wrong pending request -> Pending list should show code, client IP, created time, expiry, and user agent summary to help identify the browser.
- Existing scripts and docs mention pairing tokens heavily -> Update normal run paths to stop printing or passing pairing tokens while preserving `--disable-auth` for reverse-proxy deployments.
- Stolen cookies allow access until expiry -> Cookies are HttpOnly, long tokens are random, server stores hashes only, and authorization expires after one week.

## Migration Plan

1. Add database tables for pending pairing requests and approved devices.
2. Add backend auth service methods for request creation, status polling, approval, pending listing, and cookie validation.
3. Add public auth endpoints for creating and polling pairing requests.
4. Replace pairing-token frontend form with a pending approval page and polling loop.
5. Add binary admin commands for pending list and approve.
6. Remove normal pairing token configuration, startup logging, and script printing.
7. Update tests and documentation.

Rollback is a code rollback plus leaving the new auth tables unused. Existing pairing-token sessions are in-memory and do not require data migration.
