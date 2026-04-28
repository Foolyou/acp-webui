## MODIFIED Requirements

### Requirement: React frontend handles realtime state updates
The React frontend SHALL connect to the existing WebSocket endpoint and apply supported realtime events to the visible UI.

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

### Requirement: React frontend preserves approval and review interactions
The React frontend SHALL preserve the existing browser interactions for permission approval and session review artifacts.

#### Scenario: User resolves supported approval option
- **WHEN** a pending permission request is visible and the user selects an allow-once or reject-once option
- **THEN** the React frontend SHALL submit the selected option to the existing permission resolution API
- **AND** it SHALL clear that resolved approval from the active UI after the backend resolves the request
- **AND** it SHALL show the next queued approval when one remains

#### Scenario: Always option is visible but disabled
- **WHEN** a pending permission request includes allow-always or reject-always options
- **THEN** the React frontend SHALL render those options as disabled
- **AND** it SHALL communicate that they are not available in this version

#### Scenario: Approval queue has more than one request
- **WHEN** the current session has multiple queued approvals
- **THEN** the React frontend SHALL display the active approval controls
- **AND** it SHALL indicate that additional approvals remain queued without requiring the user to leave Session Detail

#### Scenario: User inspects review artifact
- **WHEN** the user opens a review artifact card from the session timeline
- **THEN** the React frontend SHALL fetch the artifact detail from the existing review artifact API
- **AND** it SHALL render an overlay or drill-down with the artifact title, summary, source, and payload content
