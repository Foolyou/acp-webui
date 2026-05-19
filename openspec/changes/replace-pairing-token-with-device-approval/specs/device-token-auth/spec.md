## ADDED Requirements

### Requirement: Backend exposes device authentication state
The system SHALL expose public authentication state for the current browser without disclosing device credential secrets.

#### Scenario: Anonymous browser checks auth state
- **WHEN** a browser without a valid approved device cookie requests the auth status endpoint
- **THEN** the system returns an anonymous auth state indicating pairing is required

#### Scenario: Approved browser checks auth state
- **WHEN** a browser with a valid unexpired approved device cookie requests the auth status endpoint
- **THEN** the system returns an approved device auth state indicating pairing is not required

#### Scenario: Auth-disabled browser checks auth state
- **WHEN** a browser requests the auth status endpoint while authentication is explicitly disabled
- **THEN** the system returns an auth-disabled state indicating pairing is not required

### Requirement: Anonymous browsers can create short-lived pairing requests
The system SHALL allow an anonymous browser to create a device pairing request with a unique grouped short code that expires after five minutes.

#### Scenario: Pairing request is created
- **WHEN** an anonymous browser opens the pairing page and requests a pairing challenge
- **THEN** the system creates a pending pairing request
- **AND** the response includes a grouped short code for administrator approval
- **AND** the response includes the request expiration time
- **AND** the response does not include any approved device credential

#### Scenario: Pairing request expires
- **WHEN** more than five minutes have elapsed since a pending request was created
- **THEN** polling that request reports it as expired
- **AND** the browser must create a new request before it can be approved

### Requirement: Pairing page polls approval state
The system SHALL expose a public polling endpoint that reports whether a pairing request is pending, approved, or expired.

#### Scenario: Pending request is polled
- **WHEN** a browser polls a pairing request that has not been approved and has not expired
- **THEN** the system reports pending state without setting an approved device cookie

#### Scenario: Approved request is polled
- **WHEN** a browser polls a pairing request that has been approved
- **THEN** the system sets an approved device cookie
- **AND** the response reports approved device auth state

#### Scenario: Expired request is polled
- **WHEN** a browser polls a pairing request whose five-minute approval window has elapsed
- **THEN** the system reports expired state without setting an approved device cookie

### Requirement: Administrator can list pending pairing requests
The system SHALL provide a single-binary administrator command that lists unexpired pending pairing requests.

#### Scenario: Pending requests are listed
- **WHEN** an administrator runs the pending device request listing command
- **THEN** the command prints each unexpired pending request code
- **AND** it includes identifying metadata such as client IP, user agent summary, creation time, and expiration time

#### Scenario: No pending requests exist
- **WHEN** an administrator runs the pending device request listing command and no unexpired requests exist
- **THEN** the command exits successfully and clearly indicates that no pending requests are waiting

### Requirement: Administrator can approve a pending request
The system SHALL provide a single-binary administrator command that approves an unexpired pending pairing request by code.

#### Scenario: Pending request is approved
- **WHEN** an administrator runs the approve command with an unexpired pending request code
- **THEN** the system records the request as approved
- **AND** the polling browser can receive an approved device cookie

#### Scenario: Unknown request is rejected
- **WHEN** an administrator runs the approve command with an unknown request code
- **THEN** the command fails without authorizing any device

#### Scenario: Expired request is rejected
- **WHEN** an administrator runs the approve command with a request code older than five minutes
- **THEN** the command fails without authorizing any device

### Requirement: Approved devices use secure one-week cookies
The system SHALL authorize approved browsers using opaque device session cookies that expire after one week.

#### Scenario: Approved cookie is issued
- **WHEN** a pairing request approval is consumed by the polling browser
- **THEN** the system sets an HttpOnly SameSite=Lax cookie containing an opaque device token
- **AND** the cookie expires after one week
- **AND** the durable server record stores only a hash of the device token

#### Scenario: Approved cookie authorizes API access
- **WHEN** a browser with a valid unexpired approved device cookie requests a protected API endpoint
- **THEN** the system allows the request

#### Scenario: Expired approved cookie is rejected
- **WHEN** a browser with an approved device cookie older than one week requests a protected API endpoint
- **THEN** the system rejects the request as unauthorized
- **AND** the frontend returns to the pairing page without showing stale sensitive data as current

### Requirement: Sensitive routes require approved device access
The system SHALL require a valid approved device cookie for sensitive API endpoints and WebSocket connections unless authentication is explicitly disabled.

#### Scenario: Anonymous request to app state
- **WHEN** an anonymous browser requests `/api/app-state`
- **THEN** the system rejects the request with an unauthorized response

#### Scenario: Anonymous mutation request
- **WHEN** an anonymous browser submits a workspace, session, prompt, permission, review, or cancel request
- **THEN** the system rejects the request with an unauthorized response and does not perform the mutation

#### Scenario: Anonymous WebSocket connection
- **WHEN** an anonymous browser connects to `/api/ws`
- **THEN** the system rejects the WebSocket upgrade or closes the connection without streaming session events

#### Scenario: Auth-disabled access
- **WHEN** authentication is explicitly disabled
- **THEN** protected API and WebSocket routes do not require an approved device cookie

### Requirement: Client IPs do not bypass device approval
The system SHALL require approved device authorization regardless of direct peer IP address unless authentication is explicitly disabled.

#### Scenario: Loopback request
- **WHEN** a browser connects from `127.0.0.1` or `::1`
- **THEN** the system requires device approval

#### Scenario: Private LAN request
- **WHEN** a browser connects from a private LAN address
- **THEN** the system requires device approval

#### Scenario: Forwarded header is present
- **WHEN** a request includes `X-Forwarded-For` or `Forwarded` headers
- **THEN** the system ignores those headers for authentication decisions

### Requirement: Frontend supports device approval flow
The frontend SHALL render a device approval pairing flow when the browser is anonymous and restore the existing application after approval.

#### Scenario: App loads while anonymous
- **WHEN** the frontend initializes and auth status indicates anonymous access
- **THEN** the frontend shows a pairing page instead of loading workspace, session, inbox, or review data

#### Scenario: Pairing request is waiting
- **WHEN** the pairing page has an unexpired pairing request
- **THEN** it displays the grouped short code and explains that an administrator must approve it
- **AND** it polls for approval state

#### Scenario: Pairing request is approved
- **WHEN** polling reports that the request was approved
- **THEN** the frontend proceeds to load the normal application state

#### Scenario: Pairing request expires
- **WHEN** polling reports that the request expired
- **THEN** the frontend explains that the code expired and requires generating a new request

#### Scenario: Auth expires during use
- **WHEN** a protected API request returns unauthorized while the app is in use
- **THEN** the frontend returns to the pairing flow without showing stale sensitive data as current
