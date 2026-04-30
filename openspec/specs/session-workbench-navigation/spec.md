# session-workbench-navigation Specification

## Purpose
TBD - created by archiving change redesign-session-workspace-experience. Update Purpose after archive.
## Requirements
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
The desktop frontend SHALL provide persistent navigation for Inbox, the current workspace's Sessions route, and a distinct Workspaces management route, and it MAY show a secondary workspace shortcut list when that list is labeled as a subset of workspaces rather than a separate product concept.

#### Scenario: Desktop workbench renders
- **WHEN** the viewport has desktop layout capacity
- **THEN** the app SHALL show a persistent navigation region next to the active routed content
- **AND** the active route SHALL remain visible in navigation state

#### Scenario: Desktop navigation distinguishes workspace management from shortcuts
- **WHEN** the desktop navigation renders both a Workspaces route entry and workspace-specific shortcut links
- **THEN** the Workspaces entry SHALL represent the full workspace management surface
- **AND** the shortcut group SHALL use workspace terminology that makes it clear the links are a subset of workspaces rather than a second concept such as Projects

#### Scenario: User switches workspace on desktop
- **WHEN** the user selects a workspace from desktop navigation
- **THEN** the app SHALL navigate to that workspace's session list or selected session route
- **AND** it SHALL preserve the global Codex connection status display

### Requirement: Mobile navigation opens as a full-screen menu
The mobile frontend SHALL expose workbench navigation through a route menu using the same workspace terminology and route meanings as the desktop navigation, and the menu SHALL avoid fixed full-screen visual weight when the available navigation content is shorter than the viewport.

#### Scenario: Mobile menu opens
- **WHEN** the user opens navigation on a mobile-width viewport
- **THEN** the app SHALL display a navigation layer containing Workspaces, current workspace Sessions, Inbox, and creation actions where available
- **AND** any workspace shortcut group in that layer SHALL be labeled as a subset of workspaces rather than as a separate product concept
- **AND** the navigation layer SHALL size and space its content so short navigation menus do not create a mostly empty full-height panel
- **AND** long workspace paths SHALL be truncated, wrapped, or otherwise bounded so they do not dominate navigation

#### Scenario: Mobile navigation item is selected
- **WHEN** the user selects a destination from the mobile navigation layer
- **THEN** the app SHALL navigate to that route
- **AND** the navigation layer SHALL close

### Requirement: Workspace and session creation are separate routed surfaces
The frontend SHALL present a dedicated Workspaces management surface for listing and creating local workspaces, and it SHALL keep workspace and session creation flows separate from session chat.

#### Scenario: User opens the Workspaces route
- **WHEN** the user navigates to the Workspaces route
- **THEN** the app SHALL show the full workspace list and workspace creation controls
- **AND** the surface SHALL use workspace terminology consistent with the rest of the workbench navigation

#### Scenario: User creates workspace
- **WHEN** the user opens the workspace creation surface
- **THEN** the app SHALL provide a focused workspace creation flow
- **AND** successful creation SHALL navigate to the created workspace's sessions route

#### Scenario: User creates session from workspace sessions
- **WHEN** the user creates a session from a workspace session list
- **THEN** the app SHALL keep the action scoped to that workspace
- **AND** successful creation SHALL navigate to the new session detail route

