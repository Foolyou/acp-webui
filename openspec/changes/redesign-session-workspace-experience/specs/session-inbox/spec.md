## MODIFIED Requirements

### Requirement: Inbox lists sessions needing approval
The system SHALL provide an Inbox view that prioritizes sessions waiting for user approval and routes into Session Detail.

#### Scenario: Session has a pending permission request
- **WHEN** a session has a pending permission request
- **THEN** the Inbox SHALL list that session in a needs-approval group
- **AND** it SHALL include the workspace, agent, session status, last activity, and approval summary needed to open the session detail

#### Scenario: User opens a session from Inbox
- **WHEN** the user selects a needs-approval item from the Inbox
- **THEN** the browser SHALL navigate to the routed session detail for that session
- **AND** the pending approval UI SHALL be available there

#### Scenario: User opens Inbox from mobile navigation
- **WHEN** the user selects Inbox from the mobile full-screen navigation layer
- **THEN** the browser SHALL navigate to the Inbox route
- **AND** the navigation layer SHALL close
