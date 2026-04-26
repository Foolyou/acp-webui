## MODIFIED Requirements

### Requirement: User can create a session in a workspace

The system SHALL allow the user to create a Codex-backed session for a workspace with visible creation feedback.

#### Scenario: Session is created for an existing workspace

- **WHEN** the user creates a session for an existing workspace and the Codex connection is ready
- **THEN** the backend SHALL create an ACP session through Codex
- **AND** it SHALL persist a local session record linked to the workspace
- **AND** the browser SHALL show an optimistic chat loading state until the new session detail is available
- **AND** the browser SHALL navigate to or display the new session detail view

#### Scenario: Session creation is requested while Codex is not ready

- **WHEN** the user tries to create a session while the Codex connection is starting or failed
- **THEN** the backend SHALL reject the request
- **AND** the browser SHALL show the current Codex connection status

#### Scenario: Session creation takes noticeable time

- **WHEN** session creation has not completed immediately after the user starts it
- **THEN** the browser SHALL continue showing a loading chat shell or skeleton
- **AND** it SHALL avoid presenting the app as idle or merely disabling the create button

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

- **WHEN** the user attempts to submit another prompt while a session turn is waiting for approval
- **THEN** the system SHALL prevent prompt queueing
- **AND** the browser SHALL indicate that the pending approval must be resolved before another prompt can be sent

#### Scenario: Prompt is submitted from keyboard shortcut

- **WHEN** the user presses Ctrl+Enter or Cmd+Enter in the composer while a prompt can be sent
- **THEN** the browser SHALL submit the prompt
- **AND** plain Enter SHALL remain available for multiline text entry
