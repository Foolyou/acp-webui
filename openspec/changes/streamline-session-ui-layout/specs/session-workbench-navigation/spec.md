## MODIFIED Requirements

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
