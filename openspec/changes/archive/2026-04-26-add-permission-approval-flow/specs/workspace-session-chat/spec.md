## MODIFIED Requirements

### Requirement: User can submit a text prompt

The system SHALL allow the user to submit a text prompt to an idle session.

#### Scenario: Prompt is submitted to an idle session

- **WHEN** the user submits a non-empty text prompt to an idle session
- **THEN** the backend SHALL persist the user prompt as a session message
- **AND** it SHALL send the prompt to Codex through ACP
- **AND** the browser SHALL show the submitted prompt in the session timeline

#### Scenario: Empty prompt is submitted

- **WHEN** the user submits an empty or whitespace-only prompt
- **THEN** the browser or backend SHALL reject the prompt
- **AND** no ACP prompt request SHALL be sent

#### Scenario: Prompt is submitted while the session is running

- **WHEN** the user attempts to submit another prompt while a session turn is running
- **THEN** the system SHALL prevent prompt queueing
- **AND** the browser SHALL indicate that the current turn must finish before another prompt can be sent

#### Scenario: Prompt is submitted while the session is waiting for approval

- **WHEN** the user attempts to submit another prompt while a session turn is waiting for approval
- **THEN** the system SHALL prevent prompt queueing
- **AND** the browser SHALL indicate that the pending approval must be resolved before another prompt can be sent

## ADDED Requirements

### Requirement: Session detail includes pending approval state
The system SHALL include pending permission request state when returning session detail.

#### Scenario: Session detail is loaded while waiting for approval
- **WHEN** the browser loads session detail for a session with a pending permission request
- **THEN** the backend SHALL include the pending permission request in the session detail response
- **AND** the browser SHALL render the session status as `waiting_approval`

#### Scenario: Session detail is loaded after approval expired
- **WHEN** the browser loads session detail for a session whose pending approval expired after backend restart
- **THEN** the backend SHALL return the session with failed status
- **AND** the browser SHALL show a readable failure message
