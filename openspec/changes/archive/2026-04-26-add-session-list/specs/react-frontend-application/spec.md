## MODIFIED Requirements

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
