# agent-permission-approval Specification

## Purpose
Define the ACP permission approval flow, including persistence, browser notification, supported resolution options, cancellation, and restart expiry behavior.
## Requirements
### Requirement: ACP permission requests are persisted
The system SHALL persist ACP permission requests before presenting them to the browser.

#### Scenario: Permission request is received for a known session
- **WHEN** an ACP agent sends `session/request_permission` for a known ACP session
- **THEN** the backend SHALL persist a permission request with a local id, local session id, ACP session id, ACP request id, tool call details, options, pending status, and creation timestamp
- **AND** the backend SHALL update the local session status to `waiting_approval`

#### Scenario: Permission request is received while another request is pending
- **WHEN** an ACP agent sends `session/request_permission` for a known ACP session that already has one or more pending permission requests
- **THEN** the backend SHALL persist the additional request with pending status
- **AND** it SHALL preserve its live ACP responder independently from the existing pending requests
- **AND** it SHALL update approval projections so the request is visible as queued state

#### Scenario: Permission request is received for an unknown session
- **WHEN** an ACP agent sends `session/request_permission` for an ACP session that cannot be mapped to a local session
- **THEN** the backend SHALL respond to ACP with a cancelled permission outcome
- **AND** it SHALL log enough diagnostic information for local troubleshooting

### Requirement: Browser receives pending approval updates
The system SHALL notify connected browsers when a session is waiting for one or more approvals.

#### Scenario: Browser is connected when permission is requested
- **WHEN** the backend persists a pending permission request
- **THEN** it SHALL send a realtime `permission_requested` event containing the local permission request id, session id, tool call summary, option list, pending status, and enough queue metadata to identify the active approval
- **AND** the browser SHALL render the active pending request for the affected session without polling

#### Scenario: Browser receives a queued approval request
- **WHEN** the backend persists a permission request behind an existing active pending request
- **THEN** connected browsers SHALL update the affected session to indicate that additional approvals are queued
- **AND** the active approval UI SHALL remain focused on the earliest pending request

#### Scenario: Browser reconnects while approvals are pending
- **WHEN** the browser reloads or reconnects while one or more permission requests remain pending
- **THEN** the backend SHALL return the active pending request and queue metadata in session detail or initial state data
- **AND** the browser SHALL restore the approval UI for the active request

### Requirement: User can resolve supported permission options
The system SHALL allow the user to select ACP permission options for a pending request when the option was provided by the agent.

#### Scenario: User selects an allow-once option
- **WHEN** the user selects a pending option whose kind is `allow_once`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User selects a reject-once option
- **WHEN** the user selects a pending option whose kind is `reject_once`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User selects an allow-always option
- **WHEN** the user selects a pending option whose kind is `allow_always`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User selects a reject-always option
- **WHEN** the user selects a pending option whose kind is `reject_always`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User resolves a non-pending request
- **WHEN** the browser tries to resolve a permission request that is already selected, cancelled, or expired
- **THEN** the backend SHALL reject the resolution request
- **AND** it SHALL NOT send another permission response to ACP

### Requirement: Pending approvals expire on backend restart
The system SHALL expire permission requests that were pending before backend startup.

#### Scenario: Backend starts with stale pending approvals
- **WHEN** the backend starts and finds one or more permission requests with pending status from a previous process
- **THEN** it SHALL mark those permission requests as expired
- **AND** it SHALL mark the affected sessions as failed
- **AND** session detail SHALL expose a readable failure message explaining that approval expired because the backend restarted

### Requirement: Cancelling a turn cancels pending approval
The system SHALL respond to ACP with cancelled permission outcomes when a turn is cancelled while approval is pending.

#### Scenario: User cancels while approvals are pending
- **WHEN** the user cancels a running turn that is waiting for one or more approvals
- **THEN** the backend SHALL mark all pending permission requests for that session as cancelled
- **AND** it SHALL respond to ACP with a cancelled permission outcome for every pending request that still has a live responder
- **AND** it SHALL update the session according to the cancelled turn result

### Requirement: Pending approvals are queued per session
The system SHALL support multiple pending ACP permission requests for one live session by preserving them as an ordered approval queue.

#### Scenario: Multiple permission requests arrive before user resolution
- **WHEN** an ACP agent sends another permission request for a known session that already has a pending permission request
- **THEN** the backend SHALL persist the new request as pending
- **AND** it SHALL keep the existing pending request as the active approval until that request resolves
- **AND** it SHALL NOT respond to the new ACP request until the user resolves or cancels that specific request

#### Scenario: Active queued approval is resolved
- **WHEN** the user resolves the active pending approval and another pending approval remains queued for the same session
- **THEN** the backend SHALL respond to ACP for the resolved request
- **AND** it SHALL keep the session status as `waiting_approval`
- **AND** it SHALL expose the next queued request as the active approval
- **AND** connected browsers SHALL receive enough realtime state to render the next approval without polling

#### Scenario: Final queued approval is resolved
- **WHEN** the user resolves the last pending approval for the session
- **THEN** the backend SHALL respond to ACP for that request
- **AND** it SHALL update the session status back to `running`
- **AND** connected browsers SHALL receive a `permission_resolved` event for the resolved request

