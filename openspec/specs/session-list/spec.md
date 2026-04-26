# session-list Specification

## Purpose
Define the mobile Sessions surface, including the backend session list projection, row metadata, navigation to Session Detail, realtime freshness, and loading or empty states.

## Requirements
### Requirement: Backend provides session list projection
The system SHALL provide a persisted session list projection suitable for the mobile Sessions surface.

#### Scenario: Browser loads session list
- **WHEN** the browser requests the session list
- **THEN** the backend SHALL return persisted sessions ordered by most recent activity first
- **AND** each row SHALL include the session id, workspace id, workspace name, agent name, current status, creation timestamp, last activity timestamp, pending approval indicator, and review artifact availability

#### Scenario: Session has pending approval
- **WHEN** a listed session has a pending permission request
- **THEN** the session list row SHALL indicate that approval is pending
- **AND** it SHALL include enough approval summary text for the browser to show why the session needs attention

#### Scenario: Session has review evidence
- **WHEN** a listed session has one or more review artifacts or available workspace diff evidence
- **THEN** the session list row SHALL indicate that review evidence is available
- **AND** it SHALL expose a compact count or flag without including full artifact payloads

### Requirement: User can open session from Sessions list
The system SHALL allow the user to navigate from a session list row to the corresponding Session Detail.

#### Scenario: User selects a session
- **WHEN** the user selects a session from the Sessions list
- **THEN** the browser SHALL load that session using the existing session detail API
- **AND** it SHALL render the Session Detail for that session

#### Scenario: Selected session no longer exists
- **WHEN** the user selects a session that no longer exists or cannot be loaded
- **THEN** the browser SHALL show a readable error
- **AND** it SHALL keep the user on the Sessions surface

### Requirement: Sessions list stays current during realtime updates
The system SHALL keep the visible Sessions list current as session status, approval state, and review artifact availability change.

#### Scenario: Session status changes while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a session status update
- **THEN** the browser SHALL update the affected row's status without requiring a full page reload

#### Scenario: Approval state changes while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives permission requested or permission resolved events
- **THEN** the browser SHALL update the affected row's pending approval indicator

#### Scenario: Review artifact becomes available while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a review artifact event
- **THEN** the browser SHALL update the affected row to indicate review evidence is available

### Requirement: Sessions list supports empty and loading states
The Sessions surface SHALL provide clear mobile-friendly loading and empty states.

#### Scenario: No sessions exist
- **WHEN** the browser loads the Sessions list and no sessions have been created
- **THEN** the browser SHALL show an empty state
- **AND** it SHALL provide a path to create or select a workspace and start a new session

#### Scenario: Sessions are loading
- **WHEN** the browser is fetching the Sessions list
- **THEN** the browser SHALL show a non-blocking loading state that does not obscure existing application status indicators
