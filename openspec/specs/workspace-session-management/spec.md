# workspace-session-management Specification

## Purpose
Define authenticated management behavior for persisted workspace records and locally persisted session records.
## Requirements
### Requirement: Backend manages workspace records
The system SHALL provide authenticated backend APIs to read, update, and delete persisted workspace records without changing existing workspace creation semantics.

#### Scenario: Workspace detail is requested
- **WHEN** the browser requests a workspace by id
- **THEN** the backend SHALL return the persisted workspace id, display name, path, and creation timestamp
- **AND** it SHALL return a not-found error when the workspace does not exist

#### Scenario: Workspace metadata is updated
- **WHEN** the browser submits a valid workspace metadata update
- **THEN** the backend SHALL persist the updated workspace fields
- **AND** subsequent workspace list and workspace detail responses SHALL reflect the updated metadata

#### Scenario: Workspace path update is invalid
- **WHEN** the browser submits a workspace path that does not exist, is not accessible, or is not a directory
- **THEN** the backend SHALL reject the update with a readable validation error
- **AND** the existing workspace record SHALL remain unchanged

#### Scenario: Workspace is deleted
- **WHEN** the browser requests deletion of a workspace whose related sessions are safe to remove
- **THEN** the backend SHALL delete the workspace record and its locally persisted dependent records
- **AND** subsequent workspace list responses SHALL omit the deleted workspace

#### Scenario: Workspace deletion contains active session work
- **WHEN** the browser requests deletion of a workspace containing a session with active work, pending approval, or queued prompts
- **THEN** the backend SHALL reject the deletion with a readable conflict error
- **AND** the workspace and related session records SHALL remain unchanged

### Requirement: Backend manages persisted database sessions
The system SHALL provide authenticated backend APIs to read, update, and delete persisted local database session records independently from ACP-native session list behavior.

#### Scenario: Persisted session detail is requested
- **WHEN** the browser requests a persisted session by id through the management or existing detail API
- **THEN** the backend SHALL return the local session metadata, owning workspace, selected agent, continuity metadata, and persisted history available for that session
- **AND** it SHALL return a not-found error when the session does not exist

#### Scenario: Persisted session metadata is updated
- **WHEN** the browser submits a valid metadata update for an idle persisted session
- **THEN** the backend SHALL persist the updated local session metadata
- **AND** subsequent Session Detail and workspace-agent session list responses SHALL reflect the updated metadata where those surfaces already expose that field

#### Scenario: Session update targets immutable runtime identity
- **WHEN** the browser attempts to update immutable runtime identity fields such as local session id, ACP session id, external session id, workspace id, or agent id
- **THEN** the backend SHALL reject the update
- **AND** runtime continuity and persisted history SHALL remain unchanged

#### Scenario: Persisted session is deleted
- **WHEN** the browser requests deletion of an idle persisted session with no pending approval and no queued prompts
- **THEN** the backend SHALL delete the session record and locally persisted dependent records for that session
- **AND** subsequent Session Detail requests for that session SHALL return not found

#### Scenario: Session deletion is blocked by active work
- **WHEN** the browser requests deletion of a session with active running or stopping turn state, pending approval, or queued prompts
- **THEN** the backend SHALL reject the deletion with a readable conflict error
- **AND** the session and its dependent records SHALL remain unchanged

### Requirement: Browser exposes workspace and session management
The browser SHALL expose workspace and persisted session management affordances from existing workbench surfaces without replacing session chat or session list workflows.

#### Scenario: User edits workspace metadata
- **WHEN** the user edits a workspace display field from the Workspaces management surface
- **THEN** the browser SHALL submit the update through the workspace management API
- **AND** it SHALL update visible workspace navigation and workspace detail text after the backend confirms success

#### Scenario: User deletes workspace
- **WHEN** the user chooses to delete a workspace
- **THEN** the browser SHALL show a confirmation flow that identifies the workspace and summarizes the local sessions affected when available
- **AND** it SHALL navigate away from deleted workspace routes after deletion succeeds

#### Scenario: User edits persisted session metadata
- **WHEN** the user edits supported local session metadata from a session management affordance
- **THEN** the browser SHALL submit the update through the session management API
- **AND** it SHALL keep Session Detail and the visible workspace-agent session list consistent with the confirmed response

#### Scenario: User deletes persisted session
- **WHEN** the user deletes the current persisted session
- **THEN** the browser SHALL show a confirmation flow before submitting the delete request
- **AND** after deletion succeeds it SHALL navigate to the owning workspace-agent session list rather than leaving a broken Session Detail route visible

#### Scenario: Management operation fails
- **WHEN** a workspace or session management operation fails validation, conflicts with active work, or returns not found
- **THEN** the browser SHALL show a readable recoverable error
- **AND** it SHALL preserve the user's current route and unsaved local form values where applicable

### Requirement: Management changes invalidate affected views
The system SHALL keep visible workspace, Session Detail, and workspace-agent session list surfaces current after successful management changes without changing the `session-list` projection contract.

#### Scenario: Workspace metadata changes while visible
- **WHEN** a workspace is updated through management APIs
- **THEN** the browser SHALL refresh or patch visible workspace navigation and workspace management rows
- **AND** existing session list row schema SHALL remain unchanged

#### Scenario: Session metadata changes while visible
- **WHEN** a session is updated through management APIs
- **THEN** the backend SHALL publish or return enough information for visible workspace-agent session lists and Session Detail to refresh
- **AND** the refreshed session list SHALL continue using the existing session-list projection fields and ordering rules

#### Scenario: Deleted session was visible in a session list
- **WHEN** a session is deleted through management APIs while its workspace-agent session list is visible
- **THEN** the browser SHALL remove the row by refreshing or reconciling the list
- **AND** it SHALL NOT require a page reload

#### Scenario: Deleted workspace was selected
- **WHEN** a workspace is deleted while the browser is on a route scoped to that workspace
- **THEN** the browser SHALL move to a valid Workspaces or replacement workspace route
- **AND** it SHALL clear stale local selection for the deleted workspace

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
