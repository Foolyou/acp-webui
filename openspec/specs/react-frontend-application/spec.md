# react-frontend-application Specification

## Purpose
Define the React frontend application contract, including build structure, behavior parity for existing local Codex workflows, realtime updates, approval and review interactions, and browser automation coverage.
## Requirements
### Requirement: Frontend uses React application structure
The browser frontend SHALL be implemented as a React and TypeScript single-page application built by the existing Vite frontend project and using TanStack Router for route-backed navigation.

#### Scenario: Frontend build is produced
- **WHEN** the frontend production build command is run
- **THEN** the build SHALL compile the React TypeScript application successfully
- **AND** it SHALL produce static assets that the backend can serve from the existing frontend distribution location

#### Scenario: App initializes in the browser
- **WHEN** the browser loads the frontend entrypoint
- **THEN** React SHALL mount the application into the page root
- **AND** the user SHALL see route-backed Inbox, Workspace, Sessions, and Session Detail navigation surfaces
- **AND** the user SHALL see the configured agent list and per-agent connection status where session creation or troubleshooting requires it

### Requirement: React frontend preserves current session workflows
The React frontend SHALL preserve the existing browser workflows for local workspaces, agent-backed sessions, prompt submission, timeline rendering, and persisted session restore while using the routed workbench structure.

#### Scenario: User creates workspace and session
- **WHEN** the user adds a valid local workspace path and creates a session with an available agent
- **THEN** the React frontend SHALL call the workspace and session APIs with the selected agent id
- **AND** it SHALL navigate to the selected workspace and new session route without requiring a page reload

#### Scenario: User submits prompt
- **WHEN** the user submits a non-empty prompt to an idle continuable session
- **THEN** the React frontend SHALL call the prompt API
- **AND** it SHALL render the submitted user message and assistant response updates in the session timeline
- **AND** it SHALL label the session with the selected agent identity

#### Scenario: Browser reloads existing session
- **WHEN** the browser reloads after a session has persisted timeline data
- **THEN** the React frontend SHALL restore route context from the URL and session detail APIs
- **AND** it SHALL render the persisted timeline and selected agent identity

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

### Requirement: User can choose an agent when creating a session
The React frontend SHALL let the user choose from available configured agents before creating a workspace session.

#### Scenario: Multiple agents are available
- **WHEN** the user starts creating a session in a workspace and more than one agent is available
- **THEN** the browser SHALL present a clear Codex or Claude selection control
- **AND** it SHALL submit the selected agent id to the backend session creation API

#### Scenario: Selected agent runtime is idle
- **WHEN** the user starts creating a session with an available agent whose runtime status is `idle`
- **THEN** the browser SHALL allow that agent to be selected
- **AND** it SHALL show an optimistic creation state while the backend starts the agent runtime

#### Scenario: Only one agent is available
- **WHEN** the user starts creating a session and only one agent is available
- **THEN** the browser MAY preselect that agent
- **AND** it SHALL still preserve the selected agent identity in the created session view

#### Scenario: Selected agent is unavailable
- **WHEN** the user attempts to create a session with an agent whose runtime is starting or disabled
- **THEN** the browser SHALL prevent or reject creation with a readable agent-specific status
- **AND** it SHALL keep other available agents selectable

#### Scenario: Selected agent previously failed
- **WHEN** the user selects an available agent whose previous runtime status is `failed`
- **THEN** the browser SHALL allow the user to retry creating a session with that agent
- **AND** it SHALL surface any repeated launch or authentication failure returned by the backend

### Requirement: Frontend displays per-agent runtime status
The React frontend SHALL surface agent runtime status where it affects session creation or continuation.

#### Scenario: Claude runtime fails while Codex is ready
- **WHEN** the app state reports Claude as failed and Codex as ready
- **THEN** the browser SHALL keep Codex session creation available
- **AND** it SHALL show Claude with a readable failure reason and a retryable creation affordance

#### Scenario: Existing session belongs to failed agent
- **WHEN** the user opens a session whose selected agent runtime is failed
- **THEN** the browser SHALL keep the persisted timeline reviewable
- **AND** it SHALL disable prompt submission with a reason tied to that agent runtime

### Requirement: React frontend renders session restoration states
The React frontend SHALL render session restoration state in Session Detail and Sessions list without requiring a page reload.

#### Scenario: Session is restorable
- **WHEN** Session Detail loads a persisted session that can be restored but is not currently continuable
- **THEN** the React frontend SHALL show a restore or continue action
- **AND** it SHALL keep the prompt composer disabled until restoration succeeds

#### Scenario: Session is restoring
- **WHEN** a restore request is in progress for the current session
- **THEN** the React frontend SHALL show a non-blocking restoring state
- **AND** it SHALL prevent duplicate restore requests for that session

#### Scenario: Session restore fails
- **WHEN** restoration fails for the current session
- **THEN** the React frontend SHALL show a readable failure message
- **AND** it SHALL preserve access to the persisted timeline and review evidence

#### Scenario: Session is view-only
- **WHEN** a persisted session has no verified continuation path
- **THEN** the React frontend SHALL show the view-only reason
- **AND** it SHALL keep the prompt composer disabled

### Requirement: React frontend can request session restoration
The React frontend SHALL call the backend restoration API when the user chooses to continue an eligible persisted session.

#### Scenario: User chooses continue
- **WHEN** the user activates the restore or continue action for an eligible session
- **THEN** the React frontend SHALL submit a restore request for that session
- **AND** it SHALL update local application state from the backend response and realtime events

#### Scenario: Restore succeeds
- **WHEN** the backend reports that restoration succeeded
- **THEN** the React frontend SHALL mark the session as continuable
- **AND** it SHALL enable prompt submission when the session is idle and has no pending approvals

#### Scenario: Restore is unavailable
- **WHEN** the backend reports that a session cannot be restored
- **THEN** the React frontend SHALL render the backend-provided reason
- **AND** it SHALL avoid offering prompt submission for that session

### Requirement: Frontend guards long-timeline prompt responsiveness
The React frontend SHALL include browser automation coverage that detects prompt input responsiveness regressions when Session Detail renders a long timeline.

#### Scenario: Performance regression coverage runs against a long timeline
- **WHEN** the Playwright E2E suite runs for the React frontend
- **THEN** it SHALL exercise a Session Detail view with a large rendered timeline
- **AND** it SHALL type into the enabled prompt composer
- **AND** it SHALL fail if typing latency exceeds a conservative threshold that would indicate user-visible input lag

#### Scenario: Regression coverage preserves existing session behavior
- **WHEN** the long-timeline responsiveness test runs
- **THEN** it SHALL keep the session timeline visible rather than hiding the content under test
- **AND** it SHALL verify that the composer remains enabled and usable

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

