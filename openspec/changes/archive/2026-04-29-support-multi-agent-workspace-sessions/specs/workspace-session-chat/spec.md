## MODIFIED Requirements

### Requirement: User can create a session in a workspace

The system SHALL allow the user to create an agent-backed session for a workspace with visible creation feedback.

#### Scenario: Session is created for an existing workspace

- **WHEN** the user creates a session for an existing workspace and selects an available agent
- **THEN** the backend SHALL start that agent runtime if it is idle or retryable failed
- **AND** it SHALL create an ACP session through the selected agent after the runtime is ready
- **AND** it SHALL persist a local session record linked to the workspace with the selected agent id
- **AND** the browser SHALL show an optimistic chat loading state until the new session detail is available
- **AND** the browser SHALL navigate to or display the new session detail view

#### Scenario: Session creation is requested while selected agent is starting or disabled

- **WHEN** the user tries to create a session while the selected agent connection is already starting or the selected agent is disabled
- **THEN** the backend SHALL reject the request
- **AND** the browser SHALL show the current connection status for that selected agent

#### Scenario: Session creation takes noticeable time

- **WHEN** session creation has not completed immediately after the user starts it
- **THEN** the browser SHALL continue showing a loading chat shell or skeleton
- **AND** it SHALL avoid presenting the app as idle or merely disabling the create button

#### Scenario: Session creation omits agent id

- **WHEN** a compatible client creates a session without sending an agent id
- **THEN** the backend SHALL use the configured default agent
- **AND** it SHALL persist that resolved agent id on the session

### Requirement: User can submit a text prompt

The system SHALL allow the user to submit a text prompt to an idle continuable session through that session's selected agent.

#### Scenario: Prompt is submitted to an idle session

- **WHEN** the user submits a non-empty text prompt to an idle continuable session
- **THEN** the backend SHALL persist the user prompt as a session message or timeline item
- **AND** it SHALL send the prompt to the session's selected agent through ACP
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

### Requirement: Browser displays Codex text responses

The system SHALL display text responses from the session's selected ACP agent in the session timeline.

#### Scenario: Text response is received

- **WHEN** the selected agent sends text response content for a session
- **THEN** the backend SHALL forward the text content to connected browsers for that session
- **AND** the browser SHALL display the text as an assistant message in the timeline

#### Scenario: Text response completes

- **WHEN** the selected agent finishes a text response for a prompt turn
- **THEN** the backend SHALL persist the completed assistant message
- **AND** the browser SHALL show the session as idle or completed for that turn

### Requirement: Browser receives live session updates

The system SHALL provide a realtime channel for session text and timeline updates from each session's selected agent.

#### Scenario: Browser is connected during a running prompt

- **WHEN** the browser has an open realtime connection for a session and the selected agent emits text content or tool activity
- **THEN** the browser SHALL receive the supported update without polling

#### Scenario: Browser reconnects after disconnect

- **WHEN** the browser reconnects after a temporary disconnect
- **THEN** it SHALL be able to reload the current persisted normalized session timeline
- **AND** it SHALL resume receiving subsequent live updates when the session is continuable and its selected agent runtime is ready
