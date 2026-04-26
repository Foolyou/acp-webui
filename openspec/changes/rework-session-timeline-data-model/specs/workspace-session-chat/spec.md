## MODIFIED Requirements

### Requirement: Session history survives reload

The system SHALL persist session chat history and reload it through the normalized session timeline.

#### Scenario: Browser reloads an existing session

- **WHEN** the browser opens an existing session after page reload or backend restart
- **THEN** the backend SHALL return the persisted workspace, session metadata, continuity metadata, and normalized timeline items
- **AND** the browser SHALL render the restored timeline

#### Scenario: Browser reloads a non-continuable session

- **WHEN** the browser opens an existing session whose ACP runtime context is unavailable
- **THEN** the backend SHALL return the persisted timeline for viewing
- **AND** it SHALL mark the session as not continuable with a readable `viewOnlyReason`

### Requirement: Browser receives live session updates

The system SHALL provide a realtime channel for session text and timeline updates.

#### Scenario: Browser is connected during a running prompt

- **WHEN** the browser has an open realtime connection for a session and Codex emits text content or tool activity
- **THEN** the browser SHALL receive the supported update without polling

#### Scenario: Browser reconnects after disconnect

- **WHEN** the browser reconnects after a temporary disconnect
- **THEN** it SHALL be able to reload the current persisted normalized session timeline
- **AND** it SHALL resume receiving subsequent live updates when the session is continuable

### Requirement: User can submit a text prompt

The system SHALL allow the user to submit a text prompt to an idle continuable session.

#### Scenario: Prompt is submitted to an idle session

- **WHEN** the user submits a non-empty text prompt to an idle continuable session
- **THEN** the backend SHALL persist the user prompt as a session timeline message
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

#### Scenario: Prompt is submitted to a non-continuable session

- **WHEN** the user attempts to submit a prompt to a session marked not continuable
- **THEN** the system SHALL reject the prompt without sending an ACP request
- **AND** the browser SHALL show the session's `viewOnlyReason`
