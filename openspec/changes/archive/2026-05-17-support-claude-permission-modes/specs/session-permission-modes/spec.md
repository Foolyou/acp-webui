## ADDED Requirements

### Requirement: Claude permission modes are advertised
The system SHALL expose only verified Claude permission modes through the session creation agent catalog.

#### Scenario: Browser loads Claude modes
- **WHEN** the browser loads application state or session creation metadata
- **THEN** the Claude agent SHALL advertise `manual` and `yolo` permission modes
- **AND** it SHALL NOT advertise `full_auto` until a verified Claude mapping exists

#### Scenario: Client requests unsupported Claude mode
- **WHEN** a client requests a Claude session with `full_auto` or another unsupported mode
- **THEN** the backend SHALL reject session creation with a readable validation error
- **AND** no Claude ACP session SHALL be created

### Requirement: Claude permission modes map to Claude ACP modes
The system SHALL map supported local Claude permission modes to the Claude adapter's ACP session mode option.

#### Scenario: Claude manual maps to default mode
- **WHEN** a client creates a Claude session with permission mode `manual`
- **THEN** the backend SHALL ensure the Claude ACP session mode is `default`
- **AND** it SHALL persist the local session permission mode as `manual`

#### Scenario: Claude YOLO maps to bypass mode
- **WHEN** a client creates a Claude session with permission mode `yolo`
- **THEN** the backend SHALL ensure the Claude ACP session mode is `bypassPermissions`
- **AND** it SHALL persist the local session permission mode as `yolo`
- **AND** session detail and session list projections SHALL expose the same YOLO indicators used for other YOLO sessions
