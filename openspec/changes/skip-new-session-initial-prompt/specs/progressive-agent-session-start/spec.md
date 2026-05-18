## MODIFIED Requirements

### Requirement: New Session opens workspace-scoped compose flow
New Session SHALL be scoped to the selected workspace and SHALL create a session directly from a valid launch profile selection without collecting an initial prompt first.

#### Scenario: Workspace has remembered profile
- **WHEN** the user activates New Session for a workspace with a remembered last profile
- **THEN** the browser SHALL offer Start last profile and Configure manually
- **AND** Start last profile SHALL submit session creation immediately with that profile
- **AND** it SHALL NOT open a first-prompt compose step before creating the session

#### Scenario: Workspace has no remembered profile
- **WHEN** the user activates New Session for a workspace without a remembered last profile
- **THEN** the browser SHALL open the creation screen with manual configuration controls expanded
- **AND** confirming a launchable selection SHALL submit session creation immediately without collecting an initial prompt

### Requirement: Last profile is remembered per workspace
The browser SHALL remember the most recently confirmed session creation profile separately for each workspace.

#### Scenario: Confirmed profile updates workspace memory
- **WHEN** the user creates a session from the New Session flow
- **THEN** the browser SHALL save the selected agent, permission mode, and launch control values as that workspace's last profile
- **AND** the saved profile SHALL NOT replace last profiles for other workspaces

### Requirement: Initial prompt is required for creation
The New Session flow SHALL create the selected session without collecting an initial prompt, and SHALL leave first-prompt submission to Session Detail after the session exists.

#### Scenario: Direct creation creates an empty session
- **WHEN** the user has selected a valid profile
- **THEN** the create action SHALL remain available
- **AND** activating it SHALL create an empty backend session for the selected workspace, agent, permission mode, and launch controls
- **AND** the browser SHALL navigate to Session Detail for the new session without submitting a prompt

#### Scenario: First prompt is sent from Session Detail
- **WHEN** the user submits the first prompt after the new Session Detail view opens
- **THEN** the browser SHALL submit that prompt through the normal prompt submission API
- **AND** the prompt SHALL use the same persistence, timeline, and dispatch behavior as any prompt submitted to an idle existing session
