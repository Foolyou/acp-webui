## MODIFIED Requirements

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

## ADDED Requirements

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
