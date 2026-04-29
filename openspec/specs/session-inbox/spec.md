# session-inbox Specification

## Purpose
Define the session Inbox surface for sessions that need user attention, including approval-focused projections and realtime updates.
## Requirements
### Requirement: Inbox lists sessions needing approval
The system SHALL provide an Inbox view that prioritizes sessions waiting for user approval and routes into Session Detail.

#### Scenario: Session has a pending permission request
- **WHEN** a session has one or more pending permission requests
- **THEN** the Inbox SHALL list that session in a needs-approval group
- **AND** it SHALL include the workspace, agent, session status, last activity, active approval summary, and queued approval count needed to open the session detail

#### Scenario: User opens a session from Inbox
- **WHEN** the user selects a needs-approval item from the Inbox
- **THEN** the browser SHALL navigate to the routed session detail for that session
- **AND** the active pending approval UI SHALL be available there

#### Scenario: User opens Inbox from mobile navigation
- **WHEN** the user selects Inbox from the mobile full-screen navigation layer
- **THEN** the browser SHALL navigate to the Inbox route
- **AND** the navigation layer SHALL close

### Requirement: Inbox updates when approval state changes
The system SHALL keep the Inbox current as permission requests are created, queued, or resolved.

#### Scenario: Approval request is created while Inbox is visible
- **WHEN** the browser is showing the Inbox and receives a `permission_requested` event for a session with no existing pending approvals
- **THEN** it SHALL add the affected session to the needs-approval group

#### Scenario: Additional approval request is queued while Inbox is visible
- **WHEN** the browser is showing the Inbox and receives a `permission_requested` event for a session that already has a pending approval
- **THEN** it SHALL update the affected session's queued approval count without duplicating the session row

#### Scenario: Approval request is resolved while Inbox is visible
- **WHEN** the browser is showing the Inbox and receives a `permission_resolved` event
- **THEN** it SHALL update the affected session to the next pending approval when one remains
- **AND** it SHALL remove the affected session from the needs-approval group only when no pending approvals remain

#### Scenario: Browser reloads Inbox
- **WHEN** the browser reloads the Inbox
- **THEN** the backend SHALL return the current needs-approval projection from persisted permission request state

