## ADDED Requirements

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
