## MODIFIED Requirements

### Requirement: Backend provides session list projection
The system SHALL provide persisted session list projections suitable for workspace-scoped navigation.

#### Scenario: Browser loads session list
- **WHEN** the browser requests the session list for a workspace
- **THEN** the backend SHALL return persisted sessions for that workspace ordered by most recent activity first
- **AND** each row SHALL include the session id, workspace id, workspace name, agent name, current status, creation timestamp, last activity timestamp, continuity metadata, pending approval indicator, and review artifact availability

#### Scenario: Session has pending approval
- **WHEN** a listed session has a pending permission request
- **THEN** the session list row SHALL indicate that approval is pending
- **AND** it SHALL include enough approval summary text for the browser to show why the session needs attention

#### Scenario: Session has review evidence
- **WHEN** a listed session has one or more review artifacts or available workspace diff evidence
- **THEN** the session list row SHALL indicate that review evidence is available
- **AND** it SHALL expose a compact count or flag without including full artifact payloads

#### Scenario: Session cannot continue
- **WHEN** a listed session has persisted history but no usable ACP runtime context
- **THEN** the session list row SHALL mark the session as not continuable
- **AND** it SHALL include a compact reason suitable for the browser to present in Session Detail
