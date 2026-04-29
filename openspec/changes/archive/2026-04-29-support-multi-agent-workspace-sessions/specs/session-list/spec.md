## MODIFIED Requirements

### Requirement: Backend provides session list projection
The system SHALL provide persisted session list projections suitable for workspace-scoped navigation across multiple agents.

#### Scenario: Browser loads session list
- **WHEN** the browser requests the session list for a workspace
- **THEN** the backend SHALL return persisted sessions for that workspace ordered by most recent activity first
- **AND** each row SHALL include the session id, workspace id, workspace name, selected agent id, selected agent display name, current status, creation timestamp, last activity timestamp, continuity metadata, pending approval indicator, and review artifact availability

#### Scenario: Session has pending approval
- **WHEN** a listed session has a pending permission request
- **THEN** the session list row SHALL indicate that approval is pending
- **AND** it SHALL include enough approval summary text for the browser to show why the session needs attention
- **AND** it SHALL preserve the selected agent identity for that session

#### Scenario: Session has review evidence
- **WHEN** a listed session has one or more review artifacts or available workspace diff evidence
- **THEN** the session list row SHALL indicate that review evidence is available
- **AND** it SHALL expose a compact count or flag without including full artifact payloads

#### Scenario: Session cannot continue
- **WHEN** a listed session has persisted history but no usable ACP runtime context for its selected agent
- **THEN** the session list row SHALL mark the session as not continuable
- **AND** it SHALL include a compact reason suitable for the browser to present in Session Detail

#### Scenario: Selected agent runtime is failed
- **WHEN** a listed session belongs to an agent whose runtime is failed
- **THEN** the session list row SHALL remain visible and reviewable
- **AND** it SHALL expose continuity metadata that prevents prompt submission until the agent runtime is ready or the session is restored

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
