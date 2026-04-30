## MODIFIED Requirements

### Requirement: User can choose an agent when creating a session
The React frontend SHALL let the user choose from available configured agents before creating a workspace session, using a progressive flow that separates agent selection from launch-detail confirmation.

#### Scenario: Multiple agents are available
- **WHEN** the user starts creating a session in a workspace and more than one agent is available
- **THEN** the browser SHALL present a compact first-step list of agents
- **AND** selecting one agent SHALL reveal only that agent's launch controls and permission-mode choices before confirmation
- **AND** confirming SHALL submit the selected agent id to the backend session creation API

#### Scenario: Selected agent runtime is idle
- **WHEN** the user confirms a session with an available agent whose runtime status is `idle`
- **THEN** the browser SHALL allow that agent to be selected
- **AND** it SHALL show an optimistic creation state while the backend starts the agent runtime

#### Scenario: Only one agent is available
- **WHEN** the user starts creating a session and only one agent is available
- **THEN** the browser MAY preselect that agent or keep it as the only first-step choice
- **AND** it SHALL still preserve the selected agent identity in the created session view

#### Scenario: Selected agent is unavailable
- **WHEN** the user attempts to confirm a session with an agent whose runtime is starting or disabled
- **THEN** the browser SHALL prevent or reject creation with a readable agent-specific status
- **AND** it SHALL keep other available agents selectable

#### Scenario: Selected agent previously failed
- **WHEN** the user selects an available agent whose previous runtime status is `failed`
- **THEN** the browser SHALL allow the user to retry creating a session with that agent when at least one launch mode is available
- **AND** it SHALL surface any repeated launch or authentication failure returned by the backend

### Requirement: Frontend displays per-agent runtime status
The React frontend SHALL surface agent runtime status through a dedicated status surface and within the progressive session creation flow where it affects creation or continuation.

#### Scenario: Claude runtime fails while Codex is ready
- **WHEN** the app state reports Claude as failed and Codex as ready
- **THEN** the browser SHALL keep Codex session creation available
- **AND** it SHALL show Claude with a readable failure reason on the agent status surface
- **AND** selecting Claude in New Session SHALL show its agent-specific status and retryable creation affordance only when a launch mode is available

#### Scenario: Existing session belongs to failed agent
- **WHEN** the user opens a session whose selected agent runtime is failed
- **THEN** the browser SHALL keep the persisted timeline reviewable
- **AND** it SHALL disable prompt submission with a reason tied to that agent runtime
