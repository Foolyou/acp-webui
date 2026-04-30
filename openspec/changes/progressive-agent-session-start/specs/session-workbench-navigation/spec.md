## MODIFIED Requirements

### Requirement: Desktop uses persistent workbench navigation
The desktop frontend SHALL provide persistent navigation for Inbox, the current workspace's Sessions route, an Agents status route, and a distinct Workspaces management route, and it MAY show a secondary workspace shortcut list when that list is labeled as a subset of workspaces rather than a separate product concept.

#### Scenario: Desktop workbench renders
- **WHEN** the viewport has desktop layout capacity
- **THEN** the app SHALL show a persistent navigation region next to the active routed content
- **AND** the active route SHALL remain visible in navigation state
- **AND** the navigation SHALL show a compact Agents status entry instead of rendering every agent runtime status inline

#### Scenario: Desktop navigation distinguishes workspace management from shortcuts
- **WHEN** the desktop navigation renders both a Workspaces route entry and workspace-specific shortcut links
- **THEN** the Workspaces entry SHALL represent the full workspace management surface
- **AND** the shortcut group SHALL use workspace terminology that makes it clear the links are a subset of workspaces rather than a second product concept such as Projects

#### Scenario: User switches workspace on desktop
- **WHEN** the user selects a workspace from desktop navigation
- **THEN** the app SHALL navigate to that workspace's session list or selected session route
- **AND** it SHALL preserve the compact Agents status entry in the navigation

### Requirement: Mobile navigation opens as a full-screen menu
The mobile frontend SHALL expose workbench navigation through a full-screen navigation layer using the same workspace terminology and route meanings as the desktop navigation.

#### Scenario: Mobile menu opens
- **WHEN** the user opens navigation on a mobile-width viewport
- **THEN** the app SHALL display a full-screen navigation layer containing Workspaces, current workspace Sessions, Inbox, Agents status, and creation actions
- **AND** any workspace shortcut group in that layer SHALL be labeled as a subset of workspaces rather than as a separate product concept
- **AND** the navigation layer SHALL show a compact Agents status entry instead of rendering every agent runtime status inline

#### Scenario: Mobile navigation item is selected
- **WHEN** the user selects a destination from the full-screen navigation layer
- **THEN** the app SHALL navigate to that route
- **AND** the navigation layer SHALL close
