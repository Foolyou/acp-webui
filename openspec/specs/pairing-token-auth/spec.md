## Purpose

Define local-first browser access control for ACP Web UI using pairing token sessions.

## Requirements

### Requirement: Backend exposes pairing authentication state
The system SHALL expose public authentication state for the current browser without disclosing pairing token secrets.

#### Scenario: Anonymous browser checks auth state
- **WHEN** an unpaired browser requests the auth status endpoint
- **THEN** the system returns an anonymous auth state indicating pairing is required

#### Scenario: Paired browser checks auth state
- **WHEN** a browser with a valid pairing session cookie requests the auth status endpoint
- **THEN** the system returns a paired session auth state

#### Scenario: Auth-disabled browser checks auth state
- **WHEN** a browser requests the auth status endpoint while authentication is explicitly disabled
- **THEN** the system returns an auth-disabled state indicating pairing is not required

### Requirement: User can pair a browser with a token
The system SHALL allow an unpaired browser to pair by submitting the current daemon pairing token.

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
The system SHALL require a valid pairing session for sensitive API endpoints unless authentication is explicitly disabled.

#### Scenario: Anonymous request to app state
- **WHEN** an unpaired browser requests `/api/app-state`
- **THEN** the system rejects the request with an unauthorized response

#### Scenario: Paired request to app state
- **WHEN** a browser with a valid pairing session cookie requests `/api/app-state`
- **THEN** the system returns the app state

#### Scenario: Auth-disabled request to app state
- **WHEN** a browser requests `/api/app-state` while authentication is explicitly disabled
- **THEN** the system returns the app state without requiring a pairing session cookie

#### Scenario: Anonymous mutation request
- **WHEN** an unpaired browser submits a workspace, session, prompt, permission, review, or cancel request
- **THEN** the system rejects the request with an unauthorized response and does not perform the mutation

### Requirement: WebSocket requires authenticated access
The system SHALL require a valid pairing session before accepting realtime WebSocket access unless authentication is explicitly disabled.

#### Scenario: Anonymous WebSocket connection
- **WHEN** an unpaired browser connects to `/api/ws`
- **THEN** the system rejects the WebSocket upgrade or closes the connection without streaming session events

#### Scenario: Paired WebSocket connection
- **WHEN** a browser with a valid pairing session cookie connects to `/api/ws`
- **THEN** the system accepts the WebSocket and streams realtime events

#### Scenario: Auth-disabled WebSocket connection
- **WHEN** a browser connects to `/api/ws` while authentication is explicitly disabled
- **THEN** the system accepts the WebSocket and streams realtime events without requiring a pairing session cookie

### Requirement: Client IPs do not bypass pairing
The system SHALL require pairing regardless of direct peer IP address unless authentication is explicitly disabled.

#### Scenario: Loopback request
- **WHEN** a browser connects from `127.0.0.1` or `::1`
- **THEN** the system requires pairing

#### Scenario: Private LAN request
- **WHEN** a browser connects from a private LAN address
- **THEN** the system requires pairing

#### Scenario: Forwarded header is present
- **WHEN** a request includes `X-Forwarded-For` or `Forwarded` headers
- **THEN** the system ignores those headers for authentication decisions

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
