# progressive-agent-session-start Specification

## Purpose
TBD - created by archiving change progressive-agent-session-start. Update Purpose after archive.
## Requirements
### Requirement: Workbench exposes agent status through a dedicated surface
The frontend SHALL provide a dedicated agent status surface for inspecting all configured agents without rendering the complete status list inline in persistent navigation.

#### Scenario: User opens agent status
- **WHEN** the user selects the Agents status entry from desktop or mobile workbench navigation
- **THEN** the frontend SHALL show each configured agent with its title, enabled state, runtime state, runtime message when present, and permission-mode status where applicable
- **AND** persistent navigation SHALL show only the compact Agents entry point rather than the full per-agent status list

#### Scenario: Agent status updates while visible
- **WHEN** the frontend receives an agent runtime status update while the agent status surface is visible
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

