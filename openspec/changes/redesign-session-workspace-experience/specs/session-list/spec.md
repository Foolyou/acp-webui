## MODIFIED Requirements

### Requirement: Sessions list supports empty and loading states
The Sessions surface SHALL provide clear loading, creation, and empty states aligned to the routed workbench.

#### Scenario: No sessions exist
- **WHEN** the browser loads the Sessions list for a workspace and no sessions have been created
- **THEN** the browser SHALL show an empty state
- **AND** it SHALL provide a path to start a new session in that workspace

#### Scenario: Sessions are loading
- **WHEN** the browser is fetching the Sessions list
- **THEN** the browser SHALL show a non-blocking loading state that does not obscure existing application status indicators

#### Scenario: Session is being created
- **WHEN** the user starts creating a new session from the Sessions surface
- **THEN** the browser SHALL transition to an optimistic chat creation state
- **AND** the Sessions surface SHALL not add a permanent row until the backend returns a real session

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
