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
- **AND** the user SHALL see the current Codex connection status and route-backed Inbox, Workspace, Sessions, and Session Detail navigation surfaces

### Requirement: React frontend preserves current session workflows
The React frontend SHALL preserve the existing browser workflows for local workspaces, Codex sessions, prompt submission, timeline rendering, and persisted session restore while using the new routed workbench structure.

#### Scenario: User creates workspace and session
- **WHEN** the user adds a valid local workspace path and creates a Codex session
- **THEN** the React frontend SHALL call the workspace and session APIs
- **AND** it SHALL navigate to the selected workspace and new session route without requiring a page reload

#### Scenario: User submits prompt
- **WHEN** the user submits a non-empty prompt to an idle continuable session
- **THEN** the React frontend SHALL call the prompt API
- **AND** it SHALL render the submitted user message and assistant response updates in the session timeline

#### Scenario: Browser reloads existing session
- **WHEN** the browser reloads after a session has persisted timeline data
- **THEN** the React frontend SHALL restore route context from the URL and session detail APIs
- **AND** it SHALL render the persisted timeline

### Requirement: React rewrite has parity test coverage
The React rewrite SHALL include browser automation coverage for the local Codex workflow and redesigned navigation.

#### Scenario: End-to-end suite runs against React frontend
- **WHEN** the backend binary, frontend build, and Playwright E2E suite are run with the fake ACP process
- **THEN** the tests SHALL cover workspace and session creation, routed navigation, prompt/response restore, permission approval with disabled always options, compact tool rows or review artifact inspection, mobile overlay basics, and keyboard prompt submission
