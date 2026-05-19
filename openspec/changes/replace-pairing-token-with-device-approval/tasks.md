## 1. Data Model And Backend Auth

- [x] 1.1 Add SQLite migration and storage methods for pending device pairing requests and approved device records.
- [x] 1.2 Replace pairing-token AuthService behavior with device request creation, polling, approval, listing, cookie issuing, and approved cookie validation.
- [x] 1.3 Replace `/api/auth/pair` with public device pairing request and polling endpoints while preserving auth status and protected route enforcement.
- [x] 1.4 Add single-binary administrator commands for listing pending device requests and approving a request code.

## 2. Frontend Pairing Flow

- [x] 2.1 Update frontend auth types and API client for device pairing request creation and polling.
- [x] 2.2 Replace the manual token entry pairing form with a device approval page that displays the short code, polls status, handles expiry, and loads app state after approval.
- [x] 2.3 Update frontend tests for anonymous, pending, approved, expired, and unauthorized-return flows.

## 3. Scripts, Documentation, And Compatibility

- [x] 3.1 Remove normal pairing-token startup arguments, env usage, and token-printing behavior from release/dev/deploy scripts while preserving `--disable-auth`.
- [x] 3.2 Update README and product/security notes to document device approval, pending list, approve command, cookie lifetime, and Nginx Basic Auth behavior.
- [x] 3.3 Update script tests and source checks that reference pairing-token secrets.

## 4. Verification

- [x] 4.1 Add or update Go tests for device request creation, expiry, approval, cookie security attributes, route protection, and admin commands.
- [x] 4.2 Run OpenSpec validation, backend tests, frontend tests, and security/source checks.
- [x] 4.3 Perform a final security review for token leakage, cookie attributes, auth bypasses, and stale sensitive frontend state.
