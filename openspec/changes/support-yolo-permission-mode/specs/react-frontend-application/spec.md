## ADDED Requirements

### Requirement: Frontend supports permission mode selection
The React frontend SHALL let users choose a supported permission mode before creating a workspace session.

#### Scenario: Supported modes are available
- **WHEN** the user starts creating a session for an agent that supports multiple permission modes
- **THEN** the browser SHALL present the supported modes as a clear selection control
- **AND** it SHALL submit the selected permission mode to the backend session creation API

#### Scenario: Agent supports only manual mode
- **WHEN** the selected agent supports only `manual`
- **THEN** the browser SHALL avoid offering unsupported automatic or YOLO modes
- **AND** it SHALL create the session with `manual`

#### Scenario: User selects YOLO mode
- **WHEN** the user selects `yolo` before creating a session
- **THEN** the browser SHALL show a prominent warning that approvals and sandboxing are bypassed
- **AND** the created Session Detail SHALL show a persistent YOLO indicator after navigation

### Requirement: Frontend displays session permission mode
The React frontend SHALL display the persisted permission mode where it affects supervision or review.

#### Scenario: Session detail opens
- **WHEN** the browser renders Session Detail for a session
- **THEN** it SHALL show the session's permission mode near the agent, workspace, status, or composer controls
- **AND** `yolo` SHALL be visually distinct from `manual`

#### Scenario: Sessions list opens
- **WHEN** the browser renders the Sessions list
- **THEN** it SHALL show compact permission mode metadata for sessions whose mode is not `manual`
- **AND** it SHALL preserve the indicator after reload

## MODIFIED Requirements

### Requirement: React frontend preserves approval and review interactions
The React frontend SHALL preserve the existing browser interactions for permission approval and session review artifacts.

#### Scenario: User resolves supported approval option
- **WHEN** a pending permission request is visible and the user selects an agent-provided supported option
- **THEN** the React frontend SHALL submit the selected option to the existing permission resolution API
- **AND** it SHALL clear that resolved approval from the active UI after the backend resolves the request
- **AND** it SHALL show the next queued approval when one remains

#### Scenario: Always option is visible and selectable
- **WHEN** a pending permission request includes allow-always or reject-always options
- **THEN** the React frontend SHALL render those options as selectable agent-provided choices
- **AND** it SHALL submit the selected option id through the same permission resolution API

#### Scenario: Approval queue has more than one request
- **WHEN** the current session has multiple queued approvals
- **THEN** the React frontend SHALL display the active approval controls
- **AND** it SHALL indicate that additional approvals remain queued without requiring the user to leave Session Detail

#### Scenario: User inspects review artifact
- **WHEN** the user opens a review artifact card from the session timeline
- **THEN** the React frontend SHALL fetch the artifact detail from the existing review artifact API
- **AND** it SHALL render an overlay or drill-down with the artifact title, summary, source, and payload content

### Requirement: React rewrite has parity test coverage
The React rewrite SHALL include browser automation coverage for the local Codex workflow and redesigned navigation.

#### Scenario: End-to-end suite runs against React frontend
- **WHEN** the backend binary, frontend build, and Playwright E2E suite are run with the fake ACP process
- **THEN** the tests SHALL cover workspace and session creation, routed navigation, prompt/response restore, permission approval with selectable always options, permission mode creation indicators, compact tool rows or review artifact inspection, mobile overlay basics, and keyboard prompt submission
