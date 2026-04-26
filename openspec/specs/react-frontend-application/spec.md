# react-frontend-application Specification

## Purpose
Define the React frontend application contract, including build structure, behavior parity for existing local Codex workflows, realtime updates, approval and review interactions, and browser automation coverage.

## Requirements
### Requirement: Frontend uses React application structure
The browser frontend SHALL be implemented as a React and TypeScript single-page application built by the existing Vite frontend project.

#### Scenario: Frontend build is produced
- **WHEN** the frontend production build command is run
- **THEN** the build SHALL compile the React TypeScript application successfully
- **AND** it SHALL produce static assets that the backend can serve from the existing frontend distribution location

#### Scenario: App initializes in the browser
- **WHEN** the browser loads the frontend entrypoint
- **THEN** React SHALL mount the application into the page root
- **AND** the user SHALL see the current Codex connection status and primary Inbox and Sessions navigation surfaces

### Requirement: React frontend preserves current session workflows
The React frontend SHALL preserve the existing browser workflows for local workspaces, Codex sessions, prompt submission, timeline rendering, and persisted session restore.

#### Scenario: User creates workspace and session
- **WHEN** the user adds a valid local workspace path and creates a Codex session
- **THEN** the React frontend SHALL call the existing workspace and session APIs
- **AND** it SHALL render the selected workspace and new session without requiring a page reload

#### Scenario: User submits prompt
- **WHEN** the user submits a non-empty prompt to an idle session
- **THEN** the React frontend SHALL call the existing prompt API
- **AND** it SHALL render the submitted user message and assistant response updates in the session timeline

#### Scenario: Browser reloads existing session
- **WHEN** the browser reloads after a session has persisted messages
- **THEN** the React frontend SHALL restore the selected session from existing application state and session detail APIs
- **AND** it SHALL render the persisted user and assistant messages

### Requirement: React frontend handles realtime state updates
The React frontend SHALL connect to the existing WebSocket endpoint and apply supported realtime events to the visible UI.

#### Scenario: Assistant text is streamed
- **WHEN** the WebSocket receives assistant text delta and final assistant message events for the current session
- **THEN** the React frontend SHALL render the in-progress assistant text
- **AND** it SHALL replace or complete it with the final assistant message when received

#### Scenario: Approval state changes
- **WHEN** the WebSocket receives permission requested or permission resolved events
- **THEN** the React frontend SHALL update the current session approval state
- **AND** it SHALL update the Inbox list without requiring polling

#### Scenario: Review artifact is received
- **WHEN** the WebSocket receives a review artifact event for the current session
- **THEN** the React frontend SHALL add or update the corresponding review artifact card in the session timeline

### Requirement: React frontend preserves approval and review interactions
The React frontend SHALL preserve the existing browser interactions for permission approval and session review artifacts.

#### Scenario: User resolves supported approval option
- **WHEN** a pending permission request is visible and the user selects an allow-once or reject-once option
- **THEN** the React frontend SHALL submit the selected option to the existing permission resolution API
- **AND** it SHALL clear the pending approval UI after the backend resolves the request

#### Scenario: Always option is visible but disabled
- **WHEN** a pending permission request includes allow-always or reject-always options
- **THEN** the React frontend SHALL render those options as disabled
- **AND** it SHALL communicate that they are not available in this version

#### Scenario: User inspects review artifact
- **WHEN** the user opens a review artifact card from the session timeline
- **THEN** the React frontend SHALL fetch the artifact detail from the existing review artifact API
- **AND** it SHALL render an overlay or drill-down with the artifact title, summary, source, and payload content

### Requirement: React rewrite has parity test coverage
The React rewrite SHALL include browser automation coverage for the existing local Codex workflow.

#### Scenario: End-to-end suite runs against React frontend
- **WHEN** the backend binary, frontend build, and Playwright E2E suite are run with the fake ACP process
- **THEN** the tests SHALL cover workspace and session creation, prompt/response restore, permission approval with disabled always options, and review artifact inspection
