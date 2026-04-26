## ADDED Requirements

### Requirement: ACP permission requests are persisted
The system SHALL persist ACP permission requests before presenting them to the browser.

#### Scenario: Permission request is received for a known session
- **WHEN** an ACP agent sends `session/request_permission` for a known ACP session
- **THEN** the backend SHALL persist a permission request with a local id, local session id, ACP session id, ACP request id, tool call details, options, pending status, and creation timestamp
- **AND** the backend SHALL update the local session status to `waiting_approval`

#### Scenario: Permission request is received for an unknown session
- **WHEN** an ACP agent sends `session/request_permission` for an ACP session that cannot be mapped to a local session
- **THEN** the backend SHALL respond to ACP with a cancelled permission outcome
- **AND** it SHALL log enough diagnostic information for local troubleshooting

### Requirement: Browser receives pending approval updates
The system SHALL notify connected browsers when a session is waiting for approval.

#### Scenario: Browser is connected when permission is requested
- **WHEN** the backend persists a pending permission request
- **THEN** it SHALL send a realtime `permission_requested` event containing the local permission request id, session id, tool call summary, option list, and pending status
- **AND** the browser SHALL render the pending request for the affected session without polling

#### Scenario: Browser reconnects while approval is pending
- **WHEN** the browser reloads or reconnects while a permission request remains pending
- **THEN** the backend SHALL return the pending request in session detail or initial state data
- **AND** the browser SHALL restore the approval UI for that request

### Requirement: User can resolve supported permission options
The system SHALL allow the user to select supported ACP permission options for a pending request.

#### Scenario: User selects an allow-once option
- **WHEN** the user selects a pending option whose kind is `allow_once`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status back to `running`
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User selects a reject-once option
- **WHEN** the user selects a pending option whose kind is `reject_once`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User resolves a non-pending request
- **WHEN** the browser tries to resolve a permission request that is already selected, cancelled, or expired
- **THEN** the backend SHALL reject the resolution request
- **AND** it SHALL NOT send another permission response to ACP

### Requirement: Always options are visible but disabled
The system SHALL expose `allow_always` and `reject_always` options to the browser while preventing their use in this version.

#### Scenario: Permission request includes an always option
- **WHEN** a pending permission request includes an option whose kind is `allow_always` or `reject_always`
- **THEN** the browser SHALL display the option as disabled
- **AND** the browser SHALL indicate that the option is not available in this version

#### Scenario: Disabled always option is submitted
- **WHEN** a client submits an option whose kind is `allow_always` or `reject_always`
- **THEN** the backend SHALL reject the resolution request
- **AND** it SHALL leave the permission request pending
- **AND** it SHALL NOT send a selected permission outcome to ACP

### Requirement: Pending approvals expire on backend restart
The system SHALL expire permission requests that were pending before backend startup.

#### Scenario: Backend starts with stale pending approvals
- **WHEN** the backend starts and finds permission requests with pending status from a previous process
- **THEN** it SHALL mark those permission requests as expired
- **AND** it SHALL mark the affected sessions as failed
- **AND** session detail SHALL expose a readable failure message explaining that approval expired because the backend restarted

### Requirement: Cancelling a turn cancels pending approval
The system SHALL respond to ACP with a cancelled permission outcome when a turn is cancelled while approval is pending.

#### Scenario: User cancels while approval is pending
- **WHEN** the user cancels a running turn that is waiting for approval
- **THEN** the backend SHALL mark the pending permission request as cancelled
- **AND** it SHALL respond to ACP with a cancelled permission outcome
- **AND** it SHALL update the session according to the cancelled turn result

### Requirement: Only one pending approval is supported per session
The system SHALL prevent ambiguous approval state within a single session.

#### Scenario: Second permission request arrives for a session with pending approval
- **WHEN** an ACP agent sends another permission request for a session that already has a pending permission request
- **THEN** the backend SHALL reject or cancel the second request predictably
- **AND** it SHALL keep the original pending request authoritative
- **AND** it SHALL expose a diagnostic error if the session can no longer continue safely
