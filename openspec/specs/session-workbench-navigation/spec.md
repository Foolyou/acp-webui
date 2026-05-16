# session-workbench-navigation Specification

## Purpose
TBD - created by archiving change redesign-session-workspace-experience. Update Purpose after archive.
## Requirements
### Requirement: Workbench navigation is route-backed
The frontend SHALL use URL-backed routes for workspace, workspace-agent session list, agent-scoped session detail, Inbox, Agents, and Workspaces navigation.

#### Scenario: User opens session detail route
- **WHEN** the browser opens a session detail URL containing workspace id, agent id, and session id
- **THEN** the app SHALL load the matching session detail
- **AND** the navigation SHALL identify the associated workspace, agent, and session context

#### Scenario: User selects workspace navigation
- **WHEN** the user selects a workspace navigation surface
- **THEN** the app SHALL navigate to that workspace's session list route for the last selected or default available agent
- **AND** it SHALL NOT require a separate primary Sessions navigation entry to reach that list

#### Scenario: User returns from session detail to workspace sessions
- **WHEN** the user is viewing a session detail and activates the return-to-sessions control
- **THEN** the app SHALL navigate to the current workspace and agent's session list route
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

### Requirement: Workbench remembers the current agent per workspace
The frontend SHALL remember the user's selected agent for workspace session navigation separately from session creation launch-profile defaults.

#### Scenario: Root route opens remembered workspace and agent
- **WHEN** the browser opens the root route and a previous workspace and agent selection exists
- **THEN** the app SHALL navigate to the remembered workspace-agent session list route
- **AND** it SHALL load the session list for that workspace and agent

#### Scenario: Workspace has no remembered agent
- **WHEN** the user enters a workspace that has no remembered agent selection
- **THEN** the app SHALL select a default available agent from the configured agent catalog
- **AND** it SHALL navigate to that workspace and agent's session list route

#### Scenario: User switches agent in a workspace
- **WHEN** the user chooses a different agent from the workspace sessions surface
- **THEN** the app SHALL update the route to that workspace and selected agent
- **AND** it SHALL persist that agent as the remembered agent for the workspace
- **AND** it SHALL load that agent's session list for the workspace

#### Scenario: Legacy workspace session route is opened
- **WHEN** the browser opens a legacy workspace-scoped session list route without an agent id
- **THEN** the app SHALL redirect to the remembered or default agent route for that workspace
- **AND** it SHALL preserve normal navigation history behavior for back and forward actions

### Requirement: Workbench fullscreen mode
The frontend SHALL provide a browser fullscreen control for the workbench shell
when the current browser supports fullscreen entry.

#### Scenario: User enters fullscreen mode
- **WHEN** the user activates the fullscreen control while no fullscreen element
  is active
- **THEN** the frontend SHALL request fullscreen for the application root
- **AND** the control SHALL indicate that fullscreen mode is active after the
  browser confirms the state change

#### Scenario: User exits fullscreen mode
- **WHEN** the user activates the fullscreen control while the application is
  fullscreen
- **THEN** the frontend SHALL request fullscreen exit
- **AND** the control SHALL indicate that fullscreen mode is inactive after the
  browser confirms the state change

#### Scenario: Browser fullscreen support is unavailable
- **WHEN** the browser does not expose a usable Fullscreen API
- **THEN** the frontend SHALL avoid presenting an enabled fullscreen action

#### Scenario: Fullscreen state changes outside the control
- **WHEN** the browser fullscreen state changes through browser chrome,
  keyboard shortcuts, or an implementation-specific event
- **THEN** the fullscreen control SHALL synchronize its active state with the
  browser's current fullscreen element

#### Scenario: Fullscreen control is available on narrow viewports
- **WHEN** the workbench renders on a mobile-width viewport
- **THEN** the fullscreen control SHALL remain reachable from the mobile
  workbench chrome without overlapping navigation or status controls

