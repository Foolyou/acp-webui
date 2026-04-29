## MODIFIED Requirements

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

## ADDED Requirements

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
