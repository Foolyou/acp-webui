## MODIFIED Requirements

### Requirement: Initial prompt is required for creation
The compose flow SHALL allow creating the selected session without an initial prompt, and SHALL dispatch a first prompt only when prompt content is present.

#### Scenario: Empty prompt creates an empty session
- **WHEN** the user has selected a valid profile and the initial prompt is empty
- **THEN** the create action SHALL remain available
- **AND** activating it SHALL create an empty backend session for the selected workspace, agent, permission mode, and launch controls
- **AND** the browser SHALL navigate to Session Detail for the new session without submitting a prompt

#### Scenario: Create starts first turn when prompt is present
- **WHEN** the user submits with a non-empty initial prompt
- **THEN** the browser SHALL create an empty backend session for the selected workspace, agent, permission mode, and launch controls
- **AND** after empty session creation succeeds, the browser SHALL submit the initial prompt to that new session through the normal prompt submission API
- **AND** the browser SHALL navigate to Session Detail for the new session
