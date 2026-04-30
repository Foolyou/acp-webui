## ADDED Requirements

### Requirement: ACP configuration options are projected as session controls
The system SHALL project supported ACP session configuration options as generic session-scoped controls while preserving model-specific projections.

#### Scenario: Session advertises non-model select option
- **WHEN** an ACP session configuration snapshot contains a supported select option whose category is not `model`
- **THEN** the backend SHALL preserve the option in the complete configuration snapshot
- **AND** session detail SHALL expose it as a session-scoped control with its id, name, category, current value, values, and descriptions when available

#### Scenario: Session advertises model select option
- **WHEN** an ACP session configuration snapshot contains a model selector
- **THEN** the backend SHALL continue to expose the compact current-model projection
- **AND** it SHALL also make the model selector available through the generic session control metadata

#### Scenario: Unsupported option shape is advertised
- **WHEN** an ACP session configuration snapshot contains an option shape the browser cannot render
- **THEN** the backend SHALL preserve the raw option in the complete snapshot
- **AND** the browser SHALL keep the session usable without rendering a broken control

### Requirement: Browser displays advertised session controls
The browser SHALL show supported ACP-advertised session controls in Session Detail when the session is live, idle, and continuable.

#### Scenario: Session detail has multiple controls
- **WHEN** the browser renders Session Detail for a session with multiple supported ACP configuration options
- **THEN** it SHALL render each supported option using agent-provided names, values, and descriptions when available
- **AND** it SHALL keep those controls near the prompt composer rather than only in a scroll-away page header

#### Scenario: Control update changes dependent controls
- **WHEN** a configuration update response changes the full set of session configuration options
- **THEN** the browser SHALL replace its local configuration option state with the returned complete state
- **AND** it SHALL update all visible session controls and compact projections from the refreshed state

#### Scenario: Session control is unavailable for current state
- **WHEN** the session is running, waiting for approval, not continuable, or the owning runtime is not ready
- **THEN** the browser SHALL disable session configuration controls
- **AND** it SHALL keep current values readable when metadata is available

### Requirement: User can switch supported ACP session controls
The system SHALL let the user change supported ACP session configuration options by setting the corresponding ACP config option on a live idle session.

#### Scenario: User selects another advertised config value
- **WHEN** the user selects a different value from a supported session control for a live idle session
- **THEN** the backend SHALL send ACP `session/set_config_option` to the owning agent using the session's ACP session id, the option id, and the selected value
- **AND** it SHALL persist the complete `configOptions` returned by the agent
- **AND** it SHALL return the refreshed configuration state to the browser

#### Scenario: User selects current config value
- **WHEN** the user selects the value that is already current for a session control
- **THEN** the browser or backend SHALL avoid sending a redundant ACP configuration request
- **AND** the session SHALL remain usable without changing status

#### Scenario: Agent rejects config switch
- **WHEN** the owning ACP agent rejects `session/set_config_option`
- **THEN** the backend SHALL return a readable error to the browser
- **AND** it SHALL preserve the previous persisted configuration option snapshot

#### Scenario: Config switch is requested for non-idle session
- **WHEN** the browser requests a session configuration switch for a session that is running or waiting for approval
- **THEN** the backend SHALL reject the request
- **AND** no ACP `session/set_config_option` request SHALL be sent
