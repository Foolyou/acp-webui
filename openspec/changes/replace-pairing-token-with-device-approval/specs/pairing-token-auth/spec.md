## REMOVED Requirements

### Requirement: Backend exposes pairing authentication state
**Reason**: Shared pairing-token browser authentication is replaced by explicit device approval.
**Migration**: Use the `device-token-auth` authentication state requirements.

### Requirement: User can pair a browser with a token
**Reason**: Browsers no longer submit a daemon-wide pairing token.
**Migration**: Browsers create short-lived device pairing requests and administrators approve them through the single binary.

### Requirement: Sensitive API routes require authenticated access
**Reason**: Route protection now depends on approved device cookies rather than pairing-token sessions.
**Migration**: Use the `device-token-auth` sensitive route requirements.

### Requirement: WebSocket requires authenticated access
**Reason**: WebSocket protection now depends on approved device cookies rather than pairing-token sessions.
**Migration**: Use the `device-token-auth` sensitive route requirements.

### Requirement: Client IPs do not bypass pairing
**Reason**: The access-control invariant remains but is expressed through device approval instead of pairing tokens.
**Migration**: Use the `device-token-auth` client IP requirements.

### Requirement: Frontend supports pairing flow
**Reason**: The frontend pairing form is replaced by a device approval waiting page.
**Migration**: Use the `device-token-auth` frontend flow requirements.
