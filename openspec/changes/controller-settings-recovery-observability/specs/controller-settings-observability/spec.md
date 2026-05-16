## ADDED Requirements

### Requirement: Settings contains controller configuration sections
The browser SHALL provide a Settings destination for controller support areas and SHALL keep the main product path focused on Workspaces, workspace cockpit, and Session Detail.

#### Scenario: Settings sections are visible
- **WHEN** the user opens Settings
- **THEN** the browser SHALL show Access, Agents, Storage, and Diagnostics sections
- **AND** agent status and configuration visibility SHALL live inside Settings rather than primary navigation

### Requirement: Access settings are observational
The browser SHALL show access state without changing bind mode or executing Tailscale commands.

#### Scenario: Access state is rendered
- **WHEN** Settings receives controller access data
- **THEN** it SHALL show current bind host, port, access URL, auth status, detected exposure mode, and Tailscale Serve URL when available

#### Scenario: Browser does not manage network exposure
- **WHEN** the user views Access settings
- **THEN** the UI SHALL NOT offer controls that change bind host, bind port, or Tailscale Serve configuration
- **AND** startup scripts and CLI flags SHALL remain responsible for network exposure

### Requirement: Agent configuration visibility lives in Settings
Settings SHALL show built-in and custom agent status/configuration visibility without making agents primary navigation destinations.

#### Scenario: Agent status appears in Settings
- **WHEN** Settings renders configured agents
- **THEN** it SHALL show each agent's enabled state, runtime status, launch controls, and permission mode statuses
- **AND** users SHALL still select agents through workspace-scoped session creation and cockpit filters
