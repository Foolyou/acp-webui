# progressive-agent-session-start Specification

## Purpose
TBD - created by archiving change progressive-agent-session-start. Update Purpose after archive.
## Requirements
### Requirement: Workbench exposes agent status through Settings
The frontend SHALL provide a Settings surface for inspecting all configured agents without rendering the complete status list inline in persistent navigation or exposing Agents as a primary destination.

#### Scenario: User opens agent status
- **WHEN** the user opens the agent status section from Settings
- **THEN** the frontend SHALL show each configured agent with its title, enabled state, runtime state, runtime message when present, and permission-mode status where applicable
- **AND** persistent navigation SHALL show Settings rather than an Agents primary entry point

#### Scenario: Agent status updates while visible
- **WHEN** the frontend receives an agent runtime status update while the Settings agent section is visible
- **THEN** the matching agent row SHALL update without requiring a page reload
- **AND** unrelated agent rows SHALL preserve their existing status

### Requirement: New Session uses progressive agent selection
The frontend SHALL create sessions through a progressive flow that first chooses an agent and then confirms that agent's launch details.

#### Scenario: User starts a new session
- **WHEN** the user opens New Session for a workspace
- **THEN** the frontend SHALL first show a compact list of configured agents and a Last Profile shortcut when one is available
- **AND** it SHALL NOT render every agent's permission-mode and launch-control options at the first step

#### Scenario: User selects an agent
- **WHEN** the user selects an agent from the first-step list
- **THEN** the frontend SHALL show only that agent's launch controls, permission-mode options, status context, and confirmation action
- **AND** confirming SHALL call the existing session creation flow with the selected agent id, permission mode, and launch control values

#### Scenario: Selected agent is not launchable
- **WHEN** the selected agent is disabled or all of its launch modes are unavailable
- **THEN** the frontend SHALL show the agent-specific status reason
- **AND** it SHALL prevent session creation until a launchable option is available

### Requirement: New Session supports Last Profile creation
The frontend SHALL remember the most recently confirmed session creation profile in browser-local state and offer it as a shortcut for future New Session flows.

#### Scenario: User creates with Last Profile
- **WHEN** a stored Last Profile references a currently configured agent and launchable permission mode
- **THEN** the New Session flow SHALL show a Last Profile shortcut describing the agent and permission mode
- **AND** activating it SHALL create a session with the stored agent id, permission mode, and launch control values without requiring the user to reopen the detail step

#### Scenario: Last Profile becomes invalid
- **WHEN** the stored Last Profile references a missing agent or unavailable launch mode
- **THEN** the frontend SHALL disable or hide the shortcut
- **AND** the user SHALL still be able to choose an agent through the normal progressive flow

#### Scenario: User confirms a different profile
- **WHEN** the user confirms a session creation profile that differs from the stored Last Profile
- **THEN** the frontend SHALL update the stored Last Profile after submitting session creation

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
