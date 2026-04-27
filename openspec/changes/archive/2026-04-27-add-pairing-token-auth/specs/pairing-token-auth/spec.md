## ADDED Requirements

### Requirement: Backend exposes pairing authentication state
The system SHALL expose public authentication state for the current browser without disclosing pairing token secrets.

#### Scenario: Anonymous browser checks auth state
- **WHEN** an unpaired browser requests the auth status endpoint from an untrusted client IP
- **THEN** the system returns an anonymous auth state indicating pairing is required

#### Scenario: Paired browser checks auth state
- **WHEN** a browser with a valid pairing session cookie requests the auth status endpoint
- **THEN** the system returns a paired session auth state

#### Scenario: Trusted IP checks auth state
- **WHEN** a browser requests the auth status endpoint from a trusted client IP
- **THEN** the system returns a trusted IP auth state

### Requirement: User can pair a browser with a token
The system SHALL allow an untrusted browser to pair by submitting the current daemon pairing token.

#### Scenario: Valid token is submitted
- **WHEN** an unpaired browser submits the correct pairing token
- **THEN** the system creates a browser session and returns a paired auth state

#### Scenario: Invalid token is submitted
- **WHEN** an unpaired browser submits an incorrect pairing token
- **THEN** the system rejects the request with an unauthorized response and does not create a browser session

#### Scenario: Token is not disclosed
- **WHEN** any browser requests auth status or app state
- **THEN** the response does not include the active pairing token

### Requirement: Sensitive API routes require authenticated access
The system SHALL require either a valid pairing session or trusted client IP for sensitive API endpoints.

#### Scenario: Anonymous request to app state
- **WHEN** an unpaired browser from an untrusted client IP requests `/api/app-state`
- **THEN** the system rejects the request with an unauthorized response

#### Scenario: Paired request to app state
- **WHEN** a browser with a valid pairing session cookie requests `/api/app-state`
- **THEN** the system returns the app state

#### Scenario: Trusted IP request to app state
- **WHEN** a browser from a trusted client IP requests `/api/app-state`
- **THEN** the system returns the app state without requiring a pairing session cookie

#### Scenario: Anonymous mutation request
- **WHEN** an unpaired browser from an untrusted client IP submits a workspace, session, prompt, permission, review, or cancel request
- **THEN** the system rejects the request with an unauthorized response and does not perform the mutation

### Requirement: WebSocket requires authenticated access
The system SHALL require either a valid pairing session or trusted client IP before accepting realtime WebSocket access.

#### Scenario: Anonymous WebSocket connection
- **WHEN** an unpaired browser from an untrusted client IP connects to `/api/ws`
- **THEN** the system rejects the WebSocket upgrade or closes the connection without streaming session events

#### Scenario: Paired WebSocket connection
- **WHEN** a browser with a valid pairing session cookie connects to `/api/ws`
- **THEN** the system accepts the WebSocket and streams realtime events

#### Scenario: Trusted IP WebSocket connection
- **WHEN** a browser from a trusted client IP connects to `/api/ws`
- **THEN** the system accepts the WebSocket and streams realtime events without requiring a pairing session cookie

### Requirement: Trusted client allowlist is explicit and narrow by default
The system SHALL bypass pairing only for loopback clients by default and for explicitly configured trusted IP or CIDR entries.

#### Scenario: Loopback request
- **WHEN** a browser connects from `127.0.0.1` or `::1`
- **THEN** the system treats the request as trusted by IP

#### Scenario: Configured trusted CIDR request
- **WHEN** a browser connects from an IP address inside a configured trusted CIDR
- **THEN** the system treats the request as trusted by IP

#### Scenario: Private LAN request without explicit trust
- **WHEN** a browser connects from a private LAN address that is not explicitly configured as trusted
- **THEN** the system requires pairing

#### Scenario: Forwarded header is present
- **WHEN** a request includes `X-Forwarded-For` or `Forwarded` headers
- **THEN** the system ignores those headers when evaluating trusted client allowlist membership

### Requirement: Frontend supports pairing flow
The frontend SHALL render a pairing flow when the browser is anonymous and restore the existing application after successful pairing.

#### Scenario: App loads while anonymous
- **WHEN** the frontend initializes and auth status indicates anonymous access
- **THEN** the frontend shows a pairing form instead of loading workspace, session, inbox, or review data

#### Scenario: Pairing succeeds
- **WHEN** the user submits the correct pairing token in the pairing form
- **THEN** the frontend proceeds to load the normal application state

#### Scenario: Pairing fails
- **WHEN** the user submits an incorrect pairing token in the pairing form
- **THEN** the frontend shows a readable pairing error and remains on the pairing form

#### Scenario: Auth expires during use
- **WHEN** a protected API request returns unauthorized while the app is in use
- **THEN** the frontend returns to the pairing flow without showing stale sensitive data as current
