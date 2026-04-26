# workspace-session-chat Specification

## Purpose
TBD - created by archiving change add-initial-codex-session-flow. Update Purpose after archive.
## Requirements
### Requirement: User can create a local workspace

The system SHALL allow the user to create a workspace from a local filesystem path.

#### Scenario: Workspace is created from a valid path

- **WHEN** the user submits a valid local filesystem path as a workspace
- **THEN** the backend SHALL persist the workspace with an id, display name, path, and creation timestamp
- **AND** the browser SHALL be able to show the workspace in the workspace list

#### Scenario: Workspace path is invalid

- **WHEN** the user submits a path that does not exist or cannot be accessed by the backend
- **THEN** the backend SHALL reject workspace creation
- **AND** the browser SHALL show a readable validation error

### Requirement: User can create a session in a workspace

The system SHALL allow the user to create a Codex-backed session for a workspace.

#### Scenario: Session is created for an existing workspace

- **WHEN** the user creates a session for an existing workspace and the Codex connection is ready
- **THEN** the backend SHALL create an ACP session through Codex
- **AND** it SHALL persist a local session record linked to the workspace
- **AND** the browser SHALL navigate to or display the new session detail view

#### Scenario: Session creation is requested while Codex is not ready

- **WHEN** the user tries to create a session while the Codex connection is starting or failed
- **THEN** the backend SHALL reject the request
- **AND** the browser SHALL show the current Codex connection status

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

### Requirement: Browser displays Codex text responses

The system SHALL display text responses from Codex in the session timeline.

#### Scenario: Text response is received

- **WHEN** Codex sends text response content for a session
- **THEN** the backend SHALL forward the text content to connected browsers for that session
- **AND** the browser SHALL display the text as an assistant message in the timeline

#### Scenario: Text response completes

- **WHEN** Codex finishes a text response for a prompt turn
- **THEN** the backend SHALL persist the completed assistant message
- **AND** the browser SHALL show the session as idle or completed for that turn

### Requirement: Session history survives reload

The system SHALL persist minimal session chat history in SQLite.

#### Scenario: Browser reloads an existing session

- **WHEN** the browser opens an existing session after page reload or backend restart
- **THEN** the backend SHALL return the persisted workspace, session, user prompts, and assistant text messages
- **AND** the browser SHALL render the restored timeline

### Requirement: Browser receives live session updates

The system SHALL provide a realtime channel for session text updates.

#### Scenario: Browser is connected during a running prompt

- **WHEN** the browser has an open realtime connection for a session and Codex emits text content
- **THEN** the browser SHALL receive the text update without polling

#### Scenario: Browser reconnects after disconnect

- **WHEN** the browser reconnects after a temporary disconnect
- **THEN** it SHALL be able to reload the current persisted session history
- **AND** it SHALL resume receiving subsequent live updates

### Requirement: Session timeline includes review artifact cards
The system SHALL present session review evidence inside the Session Detail timeline.

#### Scenario: Session detail includes review artifact summaries
- **WHEN** the browser loads Session Detail for a session with review artifacts
- **THEN** the timeline SHALL render compact review artifact cards among the conversation entries
- **AND** each card SHALL identify the artifact kind, title, summary, and source session context

#### Scenario: Review artifact card is opened
- **WHEN** the user selects a review artifact card in the timeline
- **THEN** the browser SHALL open a full-screen drill-down scoped to the current session
- **AND** returning from the drill-down SHALL preserve the Session Detail conversation context

#### Scenario: Session has no review artifacts
- **WHEN** the browser loads Session Detail for a session with no review artifacts
- **THEN** the timeline SHALL continue to show chat, live status, and approval state without an empty review section

### Requirement: Session review is not primary navigation
The system SHALL keep review evidence embedded in Session Detail rather than exposing a first-level Review destination in the first version.

#### Scenario: Browser shows primary navigation
- **WHEN** the app renders primary navigation
- **THEN** it SHALL NOT show Review as a first-level destination
- **AND** review drill-downs SHALL be reachable from session artifact cards
