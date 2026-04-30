## MODIFIED Requirements

### Requirement: React frontend preserves current session workflows
The React frontend SHALL preserve the existing browser workflows for local workspaces, agent-backed sessions, prompt submission, queued follow-up prompts, timeline rendering, current-turn stopping, and persisted session restore while using the routed workbench structure.

#### Scenario: User creates workspace and session
- **WHEN** the user adds a valid local workspace path and creates a session with an available agent
- **THEN** the React frontend SHALL call the workspace and session APIs with the selected agent id
- **AND** it SHALL navigate to the selected workspace and new session route without requiring a page reload

#### Scenario: User submits prompt
- **WHEN** the user submits a non-empty prompt to an idle continuable session
- **THEN** the React frontend SHALL call the prompt API
- **AND** it SHALL render the submitted user message and assistant response updates in the session timeline
- **AND** it SHALL label the session with the selected agent identity

#### Scenario: User queues prompt during active work
- **WHEN** the user submits a non-empty prompt while the visible session is running or waiting for approval
- **THEN** the React frontend SHALL call the prompt API using the same composer flow
- **AND** it SHALL render the prompt as queued instead of discarding the text or requiring the current turn to finish first
- **AND** it SHALL keep queued prompt state visible until the backend dispatches or removes it

#### Scenario: User stops active work
- **WHEN** the visible session has an active running turn
- **THEN** the React frontend SHALL expose a stop control near the active session controls or composer
- **AND** activating it SHALL call the backend stop API and render the stopping state returned by the backend

#### Scenario: Browser reloads existing session
- **WHEN** the browser reloads after a session has persisted timeline data
- **THEN** the React frontend SHALL restore route context from the URL and session detail APIs
- **AND** it SHALL render the persisted timeline, selected agent identity, queued prompts, and active turn timing when present

### Requirement: React frontend handles realtime state updates
The React frontend SHALL connect to the existing WebSocket endpoint, apply supported realtime events to the visible UI, and recover persisted session state after stale or interrupted realtime connections.

#### Scenario: Assistant text is streamed
- **WHEN** the WebSocket receives assistant text delta and final assistant message events for the current session
- **THEN** the React frontend SHALL render the in-progress assistant text
- **AND** it SHALL replace or complete it with the final assistant message when received

#### Scenario: Approval state changes
- **WHEN** the WebSocket receives permission requested or permission resolved events
- **THEN** the React frontend SHALL update the current session approval queue state
- **AND** it SHALL update the Inbox list without requiring polling
- **AND** it SHALL keep showing the active approval while additional approvals are queued

#### Scenario: Review artifact is received
- **WHEN** the WebSocket receives a review artifact event for the current session
- **THEN** the React frontend SHALL add or update the corresponding review artifact card in the session timeline

#### Scenario: Realtime connection becomes stale
- **WHEN** the WebSocket closes, errors, misses heartbeat expectations, or the browser returns from a hidden state
- **THEN** the React frontend SHALL reconnect with bounded retry behavior
- **AND** it SHALL reload the active session detail to reconcile missed persisted updates
- **AND** it SHALL continue applying subsequent realtime events by stable item ids

### Requirement: React rewrite has parity test coverage
The React rewrite SHALL include browser automation coverage for the local Codex workflow, redesigned navigation, session controls, and realtime recovery behavior.

#### Scenario: End-to-end suite runs against React frontend
- **WHEN** the backend binary, frontend build, and Playwright E2E suite are run with the fake ACP process
- **THEN** the tests SHALL cover workspace and session creation, routed navigation, prompt/response restore, permission approval with selectable always options, permission mode creation indicators, collapsed completed tool call groups with expansion, queued prompt display, stop control state, active elapsed time display, mobile realtime reconnect basics, mobile overlay basics, and keyboard prompt submission

## ADDED Requirements

### Requirement: React frontend renders completed tool call groups
The React frontend SHALL keep completed tool call history visible while reducing noise through collapsed consecutive groups.

#### Scenario: Consecutive completed tool calls render
- **WHEN** Session Detail contains consecutive completed tool call timeline items
- **THEN** the React frontend SHALL render a collapsed group that displays the number of completed tool calls
- **AND** it SHALL not omit the completed tool calls from the conversation history

#### Scenario: Completed tool group expands
- **WHEN** the user expands a completed tool call group
- **THEN** the React frontend SHALL show each grouped tool call detail in order
- **AND** the user SHALL be able to inspect the same details available from an ungrouped tool call row

### Requirement: React frontend renders active elapsed work time
The React frontend SHALL display active session work duration with clear minute and second units.

#### Scenario: Active turn timer is visible
- **WHEN** the current session is running, stopping, or waiting for approval during an active turn
- **THEN** the React frontend SHALL show elapsed work time using the active turn timing data from session state
- **AND** the displayed value SHALL update while the turn remains active

#### Scenario: Active turn timer survives foreground recovery
- **WHEN** a mobile browser returns to the app during an active turn
- **THEN** the React frontend SHALL reconcile session detail and continue the elapsed time display from backend timing data
- **AND** it SHALL not show a stale stopped timer while new messages continue arriving
