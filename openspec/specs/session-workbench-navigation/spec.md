# session-workbench-navigation Specification

## Purpose
TBD - created by archiving change redesign-session-workspace-experience. Update Purpose after archive.
## Requirements
### Requirement: Workbench navigation is route-backed
The frontend SHALL use URL-backed routes for workspace, workspace-scoped session list, session detail, Inbox, Agents, and Workspaces navigation.

#### Scenario: User opens session detail route
- **WHEN** the browser opens a session detail URL
- **THEN** the app SHALL load the matching session detail
- **AND** the navigation SHALL identify the associated workspace and session context

#### Scenario: User selects workspace navigation
- **WHEN** the user selects a workspace navigation surface
- **THEN** the app SHALL navigate to that workspace's session list route
- **AND** it SHALL NOT require a separate primary Sessions navigation entry to reach that list

#### Scenario: User returns from session detail to workspace sessions
- **WHEN** the user is viewing a session detail and activates the return-to-sessions control
- **THEN** the app SHALL navigate to the current workspace's session list route
- **AND** it SHALL use normal route-backed navigation rather than hidden local tab state

### Requirement: Desktop uses persistent workbench navigation
The desktop frontend SHALL provide persistent primary navigation for Inbox, Agents, and the distinct Workspaces management route, and it SHALL provide workspace shortcut links that enter each workspace's session list without showing a separate primary Sessions entry.

#### Scenario: Desktop workbench renders
- **WHEN** the viewport has desktop layout capacity
- **THEN** the app SHALL show a persistent navigation region next to the active routed content
- **AND** the primary navigation SHALL NOT include a standalone Sessions entry
- **AND** the active route SHALL remain visible in navigation state through the matching workspace shortcut or primary route

#### Scenario: Desktop navigation distinguishes workspace management from shortcuts
- **WHEN** the desktop navigation renders both a Workspaces route entry and workspace-specific shortcut links
- **THEN** the Workspaces entry SHALL represent the full workspace management surface
- **AND** the shortcut group SHALL use workspace terminology that makes it clear the links enter workspace-scoped session lists

#### Scenario: User switches workspace on desktop
- **WHEN** the user selects a workspace from desktop navigation
- **THEN** the app SHALL navigate to that workspace's session list route
- **AND** it SHALL preserve the global agent connection status display

### Requirement: Mobile navigation opens as a full-screen menu
The mobile frontend SHALL expose workbench navigation through a full-screen navigation layer using the same workspace terminology and route meanings as the desktop navigation, without a standalone Sessions entry.

#### Scenario: Mobile menu opens
- **WHEN** the user opens navigation on a mobile-width viewport
- **THEN** the app SHALL display a full-screen navigation layer containing Inbox, Agents, Workspaces, and workspace shortcut links
- **AND** the layer SHALL NOT include a separate primary Sessions entry
- **AND** any workspace shortcut group in that layer SHALL be labeled as a way to enter workspace-scoped session lists

#### Scenario: Mobile navigation item is selected
- **WHEN** the user selects a destination from the full-screen navigation layer
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

