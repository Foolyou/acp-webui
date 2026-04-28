## MODIFIED Requirements

### Requirement: User can submit a text prompt
The system SHALL allow the user to submit a text prompt to an idle continuable session.

#### Scenario: Prompt is submitted to an idle session
- **WHEN** the user submits a non-empty text prompt to an idle continuable session
- **THEN** the backend SHALL persist the user prompt as a session message or timeline item
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
- **WHEN** the user attempts to submit another prompt while a session turn has one or more pending approvals
- **THEN** the system SHALL prevent prompt queueing
- **AND** the browser SHALL indicate that pending approvals must be resolved before another prompt can be sent

#### Scenario: Prompt is submitted from keyboard shortcut
- **WHEN** the user presses Ctrl+Enter or Cmd+Enter in the composer while a prompt can be sent
- **THEN** the browser SHALL submit the prompt
- **AND** plain Enter SHALL remain available for multiline text entry

### Requirement: Session detail includes pending approval state
The system SHALL include pending permission request state when returning session detail.

#### Scenario: Session detail is loaded while waiting for approval
- **WHEN** the browser loads session detail for a session with one or more pending permission requests
- **THEN** the backend SHALL include the active pending permission request in the session detail response
- **AND** it SHALL include queue metadata that identifies whether additional approvals are pending
- **AND** the browser SHALL render the session status as `waiting_approval`

#### Scenario: Session detail is loaded with queued approvals
- **WHEN** the browser loads session detail for a session with multiple pending permission requests
- **THEN** the backend SHALL return the pending approval queue in deterministic creation order or enough metadata for the browser to show the active request and queued count
- **AND** the browser SHALL render the active approval and keep the composer disabled

#### Scenario: Session detail is loaded after approval expired
- **WHEN** the browser loads session detail for a session whose pending approvals expired after backend restart
- **THEN** the backend SHALL return the session with failed status
- **AND** the browser SHALL show a readable failure message
