## ADDED Requirements

### Requirement: New Session opens workspace-scoped compose flow
New Session SHALL be scoped to the selected workspace and SHALL open a compose/configuration screen before a session is created.

#### Scenario: Workspace has remembered profile
- **WHEN** the user activates New Session for a workspace with a remembered last profile
- **THEN** the browser SHALL offer Start last profile and Configure manually
- **AND** Start last profile SHALL open the compose screen with that profile preselected
- **AND** it SHALL NOT create a session until the user submits an initial prompt

#### Scenario: Workspace has no remembered profile
- **WHEN** the user activates New Session for a workspace without a remembered last profile
- **THEN** the browser SHALL open the compose screen with manual configuration controls expanded

### Requirement: Last profile is remembered per workspace
The browser SHALL remember the most recently confirmed session creation profile separately for each workspace.

#### Scenario: Confirmed profile updates workspace memory
- **WHEN** the user creates a session from the compose flow
- **THEN** the browser SHALL save the selected agent, permission mode, and launch control values as that workspace's last profile
- **AND** the saved profile SHALL NOT replace last profiles for other workspaces

### Requirement: Initial prompt is required for creation
The compose flow SHALL require an initial prompt before creating the session.

#### Scenario: Empty prompt is blocked
- **WHEN** the user has selected a valid profile but the initial prompt is empty
- **THEN** the create action SHALL remain unavailable

#### Scenario: Create starts first turn
- **WHEN** the user submits a valid initial prompt
- **THEN** the backend SHALL create the session and start the first prompt turn from that initial prompt
- **AND** the browser SHALL navigate to Session Detail for the new session
