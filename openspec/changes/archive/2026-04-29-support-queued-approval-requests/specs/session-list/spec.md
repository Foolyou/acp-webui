## MODIFIED Requirements

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
