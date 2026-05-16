## ADDED Requirements

### Requirement: Workspace list presents project cards with lightweight state
The workspace list SHALL present workspaces as project entries and SHALL include lightweight state summaries that help the user choose where to continue work.

#### Scenario: Workspace card summarizes attention
- **WHEN** a workspace has sessions or inbox items represented in the browser projection
- **THEN** its workspace card SHALL show available counts for pending approvals, running sessions, failed sessions, and recent activity
- **AND** entering the workspace SHALL remain the primary action

#### Scenario: Workspace management actions are secondary
- **WHEN** the user views a workspace card
- **THEN** create, edit, and delete management actions SHALL remain available
- **AND** they SHALL NOT dominate the project-list presentation over opening the workspace
