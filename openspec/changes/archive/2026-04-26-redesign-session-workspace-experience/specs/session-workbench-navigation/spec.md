## ADDED Requirements

### Requirement: Workbench navigation is route-backed
The frontend SHALL use URL-backed routes for workspace, session list, session detail, and Inbox navigation.

#### Scenario: User opens session detail route
- **WHEN** the browser opens a session detail URL
- **THEN** the app SHALL load the matching session detail
- **AND** the navigation SHALL identify the associated workspace and session context

#### Scenario: User selects Sessions navigation while viewing a session
- **WHEN** the user is viewing a session detail and selects the Sessions navigation surface
- **THEN** the app SHALL navigate to the current workspace's session list route
- **AND** it SHALL NOT treat the navigation as a transient tab button with hidden local state

### Requirement: Desktop uses persistent workbench navigation
The desktop frontend SHALL provide persistent navigation for workspaces, sessions, and Inbox.

#### Scenario: Desktop workbench renders
- **WHEN** the viewport has desktop layout capacity
- **THEN** the app SHALL show a persistent navigation region next to the active routed content
- **AND** the active route SHALL remain visible in navigation state

#### Scenario: User switches workspace on desktop
- **WHEN** the user selects a workspace from desktop navigation
- **THEN** the app SHALL navigate to that workspace's session list or selected session route
- **AND** it SHALL preserve the global Codex connection status display

### Requirement: Mobile navigation opens as a full-screen menu
The mobile frontend SHALL expose workbench navigation through a full-screen navigation layer.

#### Scenario: Mobile menu opens
- **WHEN** the user opens navigation on a mobile-width viewport
- **THEN** the app SHALL display a full-screen navigation layer containing Workspaces, current workspace Sessions, Inbox, and creation actions
- **AND** it SHALL provide a fixed close affordance

#### Scenario: Mobile navigation item is selected
- **WHEN** the user selects a destination from the full-screen navigation layer
- **THEN** the app SHALL navigate to that route
- **AND** the navigation layer SHALL close

### Requirement: Workspace and session creation are separate routed surfaces
The frontend SHALL present workspace list/create and session list/create as separate routed surfaces from session chat.

#### Scenario: User creates workspace
- **WHEN** the user opens the workspace creation surface
- **THEN** the app SHALL provide a focused workspace creation flow
- **AND** successful creation SHALL navigate to the created workspace's sessions route

#### Scenario: User creates session from workspace sessions
- **WHEN** the user creates a session from a workspace session list
- **THEN** the app SHALL keep the action scoped to that workspace
- **AND** successful creation SHALL navigate to the new session detail route
