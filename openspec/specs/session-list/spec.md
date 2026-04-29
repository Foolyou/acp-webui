# session-list Specification

## Purpose
Define the mobile Sessions surface, including the backend session list projection, row metadata, navigation to Session Detail, realtime freshness, and loading or empty states.
## Requirements
### Requirement: Backend provides session list projection
The system SHALL provide persisted session list projections suitable for workspace-scoped navigation.

#### Scenario: Browser loads session list
- **WHEN** the browser requests the session list for a workspace
- **THEN** the backend SHALL return persisted sessions for that workspace ordered by most recent activity first
- **AND** each row SHALL include the session id, workspace id, workspace name, agent name, current status, creation timestamp, last activity timestamp, continuity metadata, pending approval indicator, queued approval count, and review artifact availability

#### Scenario: Session has pending approval
- **WHEN** a listed session has one or more pending permission requests
- **THEN** the session list row SHALL indicate that approval is pending
- **AND** it SHALL include enough active approval summary text and queued count for the browser to show why the session needs attention

#### Scenario: Session has review evidence
- **WHEN** a listed session has one or more review artifacts or available workspace diff evidence
- **THEN** the session list row SHALL indicate that review evidence is available
- **AND** it SHALL expose a compact count or flag without including full artifact payloads

#### Scenario: Session cannot continue
- **WHEN** a listed session has persisted history but no usable ACP runtime context
- **THEN** the session list row SHALL mark the session as not continuable
- **AND** it SHALL include a compact reason suitable for the browser to present in Session Detail

### Requirement: User can open session from Sessions list
The system SHALL allow the user to navigate from a workspace-scoped session list row to the corresponding Session Detail route.

#### Scenario: User selects a session
- **WHEN** the user selects a session from the Sessions list
- **THEN** the browser SHALL navigate to that session's routed Session Detail
- **AND** it SHALL render the Session Detail for that session

#### Scenario: Selected session no longer exists
- **WHEN** the user selects a session that no longer exists or cannot be loaded
- **THEN** the browser SHALL show a readable error
- **AND** it SHALL keep the user in the current workspace context

### Requirement: Sessions list stays current during realtime updates
The system SHALL keep the visible Sessions list current as session status, approval state, and review artifact availability change.

#### Scenario: Session status changes while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a session status update
- **THEN** the browser SHALL update the affected row's status without requiring a full page reload

#### Scenario: Approval state changes while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives permission requested or permission resolved events
- **THEN** the browser SHALL update the affected row's pending approval indicator, active approval summary, and queued approval count

#### Scenario: Review artifact becomes available while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a review artifact event
- **THEN** the browser SHALL update the affected row to indicate review evidence is available

### Requirement: Sessions list supports empty and loading states
The Sessions surface SHALL provide clear loading, creation, agent selection, and empty states aligned to the routed workbench.

#### Scenario: No sessions exist
- **WHEN** the browser loads the Sessions list for a workspace and no sessions have been created
- **THEN** the browser SHALL show an empty state
- **AND** it SHALL provide a path to start a new session in that workspace with an available agent

#### Scenario: Sessions are loading
- **WHEN** the browser is fetching the Sessions list
- **THEN** the browser SHALL show a non-blocking loading state that does not obscure existing application status indicators

#### Scenario: Session is being created
- **WHEN** the user starts creating a new session from the Sessions surface
- **THEN** the browser SHALL transition to an optimistic chat creation state that identifies the selected agent
- **AND** the Sessions surface SHALL not add a permanent row until the backend returns a real session

### Requirement: Session list represents restoration state
The system SHALL include restoration state in workspace-scoped session list rows.

#### Scenario: Listed session is live
- **WHEN** a listed session has live agent runtime context
- **THEN** the session list row SHALL indicate that the session is continuable
- **AND** it SHALL avoid showing restore-required messaging

#### Scenario: Listed session is restorable
- **WHEN** a listed session has persisted history and a verified agent continuation path but no live runtime context
- **THEN** the session list row SHALL indicate that the session can be restored
- **AND** it SHALL include compact metadata suitable for opening the session and continuing from Session Detail

#### Scenario: Listed session is permanently view-only
- **WHEN** a listed session has persisted history but no verified continuation path
- **THEN** the session list row SHALL mark the session as view-only
- **AND** it SHALL include a compact reason suitable for Session Detail

#### Scenario: Listed session failed to restore
- **WHEN** a listed session has a failed restore attempt
- **THEN** the session list row SHALL expose that failure state
- **AND** it SHALL keep review evidence and normal session navigation available

### Requirement: Session list updates during restoration
The system SHALL keep visible session list rows current when restoration state changes.

#### Scenario: Restore starts while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a restore-started update
- **THEN** the browser SHALL update the affected row to show restoration is in progress

#### Scenario: Restore succeeds while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a restore-succeeded update
- **THEN** the browser SHALL update the affected row to show the session is continuable

#### Scenario: Restore fails while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a restore-failed update
- **THEN** the browser SHALL update the affected row to show the restore failure state

