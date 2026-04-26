## ADDED Requirements

### Requirement: Inbox lists sessions needing approval
The system SHALL provide an Inbox view that prioritizes sessions waiting for user approval.

#### Scenario: Session has a pending permission request
- **WHEN** a session has a pending permission request
- **THEN** the Inbox SHALL list that session in a needs-approval group
- **AND** it SHALL include the workspace, agent, session status, last activity, and approval summary needed to open the session detail

#### Scenario: User opens a session from Inbox
- **WHEN** the user selects a needs-approval item from the Inbox
- **THEN** the browser SHALL navigate to or display the session detail for that session
- **AND** the pending approval UI SHALL be available there

### Requirement: Inbox updates when approval state changes
The system SHALL keep the Inbox current as permission requests are created or resolved.

#### Scenario: Approval request is created while Inbox is visible
- **WHEN** the browser is showing the Inbox and receives a `permission_requested` event
- **THEN** it SHALL add or update the affected session in the needs-approval group

#### Scenario: Approval request is resolved while Inbox is visible
- **WHEN** the browser is showing the Inbox and receives a `permission_resolved` event
- **THEN** it SHALL remove the affected pending approval item from the needs-approval group

#### Scenario: Browser reloads Inbox
- **WHEN** the browser reloads the Inbox
- **THEN** the backend SHALL return the current needs-approval projection from persisted permission request state
