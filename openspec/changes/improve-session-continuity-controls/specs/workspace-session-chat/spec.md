## MODIFIED Requirements

### Requirement: User can submit a text prompt
The system SHALL allow the user to submit a text prompt to an idle continuable session or enqueue it for the same session when the current turn is busy.

#### Scenario: Prompt is submitted to an idle session
- **WHEN** the user submits a non-empty text prompt to an idle continuable session
- **THEN** the backend SHALL persist the user prompt as a session message or timeline item
- **AND** it SHALL send the prompt to Codex through ACP
- **AND** the browser SHALL show the submitted prompt in the session timeline

#### Scenario: Empty prompt is submitted
- **WHEN** the user submits an empty or whitespace-only prompt
- **THEN** the browser or backend SHALL reject the prompt
- **AND** no ACP prompt request SHALL be sent
- **AND** no queued prompt SHALL be created

#### Scenario: Prompt is submitted while the session is running
- **WHEN** the user submits a non-empty prompt while a session turn is running
- **THEN** the backend SHALL persist the prompt in that session's ordered prompt queue
- **AND** it SHALL NOT send the queued prompt to ACP until the current turn finishes and the session is eligible for another prompt
- **AND** the browser SHALL show the queued prompt and its queued state

#### Scenario: Prompt is submitted while the session is waiting for approval
- **WHEN** the user submits a non-empty prompt while a session turn has one or more pending approvals
- **THEN** the backend SHALL persist the prompt in that session's ordered prompt queue
- **AND** it SHALL NOT send the queued prompt to ACP until all blocking approvals are resolved and the current turn finishes
- **AND** the browser SHALL indicate that queued work is waiting behind approval resolution

#### Scenario: Queued prompt dispatches after active work completes
- **WHEN** a session with queued prompts becomes idle, continuable, and has no pending approvals
- **THEN** the backend SHALL dispatch the oldest queued prompt to ACP
- **AND** it SHALL update the queued prompt from queued to submitted in the session timeline or queue projection
- **AND** remaining queued prompts SHALL keep their relative order

#### Scenario: Prompt is submitted from keyboard shortcut
- **WHEN** the user presses Ctrl+Enter or Cmd+Enter in the composer while a prompt can be sent or queued
- **THEN** the browser SHALL submit or queue the prompt according to the current session state
- **AND** plain Enter SHALL remain available for multiline text entry

### Requirement: Browser receives live session updates
The system SHALL provide a realtime channel for session text and timeline updates from each session's selected agent and SHALL recover missed persisted state after temporary browser disconnects.

#### Scenario: Browser is connected during a running prompt
- **WHEN** the browser has an open realtime connection for a session and the selected agent emits text content or tool activity
- **THEN** the browser SHALL receive the supported update without polling

#### Scenario: Browser reconnects after disconnect
- **WHEN** the browser reconnects after a temporary disconnect
- **THEN** it SHALL reload the current persisted normalized session timeline before or while resuming live updates
- **AND** it SHALL resume receiving subsequent live updates when the session is continuable and its selected agent runtime is ready

#### Scenario: Mobile browser returns from background
- **WHEN** a mobile browser returns to the app after being backgrounded long enough that the realtime connection may be stale
- **THEN** the browser SHALL verify or recreate the realtime connection
- **AND** it SHALL reload the visible session detail to reconcile messages, tool calls, approvals, queued prompts, and turn state that changed while inactive

## ADDED Requirements

### Requirement: User can stop the active session turn
The system SHALL allow the user to request stopping the current active turn for a continuable session.

#### Scenario: Stop is requested during a running turn
- **WHEN** the user activates stop for a session with an active running turn
- **THEN** the backend SHALL route a stop or cancellation request through the session's owning agent runtime
- **AND** the browser SHALL show that the turn is stopping
- **AND** the system SHALL preserve already persisted messages, tool calls, approvals, and review artifacts

#### Scenario: Stop completes
- **WHEN** the owning agent confirms cancellation or the active turn otherwise ends after a stop request
- **THEN** the backend SHALL mark the active turn as stopped or idle according to the final agent state
- **AND** the browser SHALL remove the stopping indicator and show the resulting session state without requiring reload

#### Scenario: Stop is unavailable
- **WHEN** the session is not running or its owning agent runtime cannot accept a stop request
- **THEN** the backend SHALL reject the stop request with a readable reason
- **AND** the browser SHALL keep the timeline reviewable and show the reason without losing queued prompts

### Requirement: Active session work exposes elapsed time
The system SHALL expose enough turn timing data for the browser to display how long active session work has been running.

#### Scenario: Turn is running
- **WHEN** a session turn is running or waiting for approval within an active turn
- **THEN** session detail SHALL include the active turn start timestamp or equivalent elapsed-time source
- **AND** the browser SHALL display elapsed work time in minutes and seconds

#### Scenario: Browser reloads during active turn
- **WHEN** the browser reloads or reconnects during an active turn
- **THEN** the elapsed work time display SHALL continue from the persisted active turn timing data
- **AND** it SHALL NOT reset to zero solely because the page reloaded

#### Scenario: Turn finishes
- **WHEN** the active turn finishes, stops, or fails
- **THEN** the browser SHALL stop incrementing the active elapsed time display
- **AND** it SHALL show the final session state instead of an active work timer
