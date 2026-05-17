## MODIFIED Requirements

### Requirement: Initial prompt is required for creation
The compose flow SHALL require an initial prompt before submitting the new-session flow, but SHALL create the selected session before dispatching that prompt.

#### Scenario: Empty prompt is blocked
- **WHEN** the user has selected a valid profile but the initial prompt is empty
- **THEN** the create action SHALL remain unavailable

#### Scenario: Create starts first turn
- **WHEN** the user submits a valid initial prompt
- **THEN** the browser SHALL create an empty backend session for the selected workspace, agent, permission mode, and launch controls
- **AND** after empty session creation succeeds, the browser SHALL submit the initial prompt to that new session through the normal prompt submission API
- **AND** the browser SHALL navigate to Session Detail for the new session
