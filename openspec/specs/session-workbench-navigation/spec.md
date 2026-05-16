# session-workbench-navigation Specification

## Purpose
Define the routed workbench navigation model for workspace cockpit supervision, Session Detail, Inbox, Settings, and Workspaces management.
## Requirements
### Requirement: Workbench navigation is route-backed
The frontend SHALL use URL-backed routes for workspace cockpit, Session Detail, Inbox, Settings, and Workspaces navigation.

#### Scenario: User opens session detail route
- **WHEN** the browser opens a session detail URL containing workspace id and session id
- **THEN** the app SHALL load the matching session detail
- **AND** the navigation SHALL identify the associated workspace, agent, and session context

#### Scenario: User selects workspace navigation
- **WHEN** the user selects a workspace navigation surface
- **THEN** the app SHALL navigate to that workspace's cockpit route
- **AND** it SHALL NOT require a separate primary Sessions navigation entry to reach that list

#### Scenario: User returns from session detail to workspace sessions
- **WHEN** the user is viewing a session detail and activates the return-to-sessions control
- **THEN** the app SHALL navigate to the current workspace cockpit route
- **AND** it SHALL use normal route-backed navigation rather than hidden local tab state

### Requirement: Desktop uses persistent workbench navigation
The desktop frontend SHALL provide persistent primary navigation for Inbox, Settings, and the distinct Workspaces management route, and it SHALL provide workspace shortcut links that enter each workspace cockpit without showing a separate primary Sessions entry.

#### Scenario: Desktop workbench renders
- **WHEN** the viewport has desktop layout capacity
- **THEN** the app SHALL show a persistent navigation region next to the active routed content
- **AND** the primary navigation SHALL NOT include a standalone Sessions entry
- **AND** the active route SHALL remain visible in navigation state through the matching workspace shortcut or primary route

#### Scenario: Desktop navigation distinguishes workspace management from shortcuts
- **WHEN** the desktop navigation renders both a Workspaces route entry and workspace-specific shortcut links
- **THEN** the Workspaces entry SHALL represent the full workspace management surface
- **AND** the shortcut group SHALL use workspace terminology that makes it clear the links enter workspace cockpits

#### Scenario: User switches workspace on desktop
- **WHEN** the user selects a workspace from desktop navigation
- **THEN** the app SHALL navigate to that workspace's cockpit route
- **AND** it SHALL preserve the global agent connection status display

### Requirement: Mobile navigation opens as a full-screen menu
The mobile frontend SHALL expose workbench navigation through a full-screen navigation layer using the same workspace terminology and route meanings as the desktop navigation, without a standalone Sessions entry.

#### Scenario: Mobile menu opens
- **WHEN** the user opens navigation on a mobile-width viewport
- **THEN** the app SHALL display a full-screen navigation layer containing Inbox, Settings, Workspaces, and workspace shortcut links
- **AND** the layer SHALL NOT include a separate primary Sessions entry
- **AND** any workspace shortcut group in that layer SHALL be labeled as a way to enter workspace cockpits

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
- **AND** successful creation SHALL navigate to the created workspace's cockpit route

#### Scenario: User creates session from workspace sessions
- **WHEN** the user creates a session from a workspace cockpit
- **THEN** the app SHALL keep the action scoped to that workspace
- **AND** successful creation SHALL navigate to the new session detail route

### Requirement: Workbench preserves optional workspace agent filters
The frontend SHALL treat agent selection as a workspace cockpit filter rather than a primary route destination.

#### Scenario: Root route opens remembered workspace
- **WHEN** the browser opens the root route and a previous workspace selection exists
- **THEN** the app SHALL navigate to the remembered workspace cockpit route
- **AND** it SHALL load the session list for that workspace

#### Scenario: Workspace has no remembered agent filter
- **WHEN** the user enters a workspace that has no remembered agent filter
- **THEN** the app SHALL show all agents by default
- **AND** it SHALL keep the agent filter available inside the workspace cockpit

#### Scenario: User filters by agent in a workspace
- **WHEN** the user chooses an agent from the workspace cockpit filter
- **THEN** the app SHALL narrow the visible workspace session list to that agent
- **AND** it MAY preserve that agent as the remembered filter for that workspace

#### Scenario: Legacy workspace agent session route is opened
- **WHEN** the browser opens a legacy workspace-agent session list route
- **THEN** the app SHALL preserve navigation by opening the workspace cockpit with the matching agent filter applied or redirecting to an equivalent workspace cockpit state
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

### Requirement: Workspace cockpit is the primary session route
The browser SHALL make workspace selection the primary entry point and SHALL use the workspace cockpit as the primary route for supervising sessions in a workspace.

#### Scenario: Root opens a remembered workspace
- **WHEN** the browser initializes with a remembered workspace
- **THEN** it SHALL navigate to that workspace's cockpit route
- **AND** it SHALL NOT redirect to an agent-specific session list as the primary route

#### Scenario: Workspace card opens cockpit
- **WHEN** the user activates a workspace from the workspace list
- **THEN** the browser SHALL open the workspace cockpit for that workspace
- **AND** the cockpit SHALL show sessions across all configured agents by default

#### Scenario: Agent route compatibility
- **WHEN** the browser opens an existing agent-scoped workspace session URL
- **THEN** the browser SHALL preserve navigation by opening the same workspace cockpit with the matching agent filter applied or by redirecting to an equivalent workspace cockpit state

### Requirement: Agents are not primary navigation destinations
The browser SHALL keep agents as execution choices, filters, and settings entries rather than primary workbench destinations.

#### Scenario: Primary navigation is workspace oriented
- **WHEN** the user opens the workbench navigation
- **THEN** the primary navigation SHALL expose Workspaces, Inbox, and Settings
- **AND** it SHALL NOT expose Agents as a top-level primary destination
