# session-config-options Specification

## Purpose
TBD - created by archiving change add-acp-model-selection. Update Purpose after archive.
## Requirements
### Requirement: Session configuration options are captured
The system SHALL capture ACP session configuration options returned by the owning agent and associate them with the local session.

#### Scenario: New session advertises configuration options
- **WHEN** an ACP agent returns `configOptions` from `session/new`
- **THEN** the backend SHALL persist the complete configuration option snapshot for the created local session
- **AND** the session detail API SHALL return those configuration options

#### Scenario: New session has no configuration options
- **WHEN** an ACP agent returns no `configOptions` from `session/new`
- **THEN** the backend SHALL create the local session normally
- **AND** the session detail API SHALL return no configurable session options for that session

#### Scenario: Restored session advertises configuration options
- **WHEN** an ACP agent returns `configOptions` from `session/load` while restoring a persisted local session
- **THEN** the backend SHALL replace the local session's configuration option snapshot with the returned complete state
- **AND** the restored session detail SHALL expose that refreshed state

### Requirement: Current model metadata is projected from ACP options
The system SHALL derive compact current-model metadata from the session configuration option snapshot when a model selector is advertised.

#### Scenario: Model category option exists
- **WHEN** a session configuration snapshot contains a select option with `category` equal to `model`
- **THEN** the backend SHALL identify that option as the session model selector
- **AND** it SHALL expose the selector id, current value, and matching display name when available

#### Scenario: Model category is missing but model id exists
- **WHEN** a session configuration snapshot has no model category option but contains a select option with id `model`
- **THEN** the backend SHALL identify that option as the session model selector
- **AND** it SHALL expose the selector id, current value, and matching display name when available

#### Scenario: No model selector exists
- **WHEN** a session configuration snapshot contains no model selector
- **THEN** the backend SHALL expose no current-model projection
- **AND** the browser SHALL not render a model selection control for that session

### Requirement: Browser displays advertised model choices
The browser SHALL show a model selector in Session Detail when the current session has an advertised ACP model configuration option, and the selector SHALL live in a compact session header or session settings surface rather than as a permanent section inside the sticky prompt composer.

#### Scenario: Session detail has a model selector
- **WHEN** the browser renders Session Detail for a session with a model configuration option
- **THEN** it SHALL show the current model display name or value
- **AND** it SHALL offer the advertised model choices using the agent-provided option names and descriptions when available
- **AND** the selector SHALL remain available from the session context controls while the user scrolls through session history
- **AND** the selector SHALL NOT increase the persistent prompt composer height

#### Scenario: Session detail has dependent configuration changes
- **WHEN** a model selection response changes the full set of configuration options
- **THEN** the browser SHALL replace its local configuration option state with the returned complete state
- **AND** it SHALL update the visible current model from the refreshed state

#### Scenario: Model selector is unavailable for current state
- **WHEN** the session is running, waiting for approval, not continuable, or the owning agent runtime is not ready
- **THEN** the browser SHALL disable model switching
- **AND** it SHALL keep the current model readable when model metadata is available
- **AND** it SHALL avoid expanding the composer solely to explain the disabled state

### Requirement: User can switch model through ACP config options
The system SHALL let the user change the session model by setting the ACP model configuration option on a live idle session.

#### Scenario: User selects another advertised model
- **WHEN** the user selects a different value from the session model selector for a live idle session
- **THEN** the backend SHALL send ACP `session/set_config_option` to the owning agent using the session's ACP session id, the model selector id, and the selected value
- **AND** it SHALL persist the complete `configOptions` returned by the agent
- **AND** it SHALL return the refreshed configuration state to the browser

#### Scenario: User selects the current model
- **WHEN** the user selects the model value that is already current
- **THEN** the browser or backend SHALL avoid sending a redundant ACP configuration request
- **AND** the session SHALL remain usable without changing status

#### Scenario: Agent rejects model switch
- **WHEN** the owning ACP agent rejects `session/set_config_option`
- **THEN** the backend SHALL return a readable error to the browser
- **AND** it SHALL preserve the previous persisted configuration option snapshot

#### Scenario: Model switch is requested for non-idle session
- **WHEN** the browser requests a model switch for a session that is running or waiting for approval
- **THEN** the backend SHALL reject the request
- **AND** no ACP `session/set_config_option` request SHALL be sent

#### Scenario: Model switch is requested for non-continuable session
- **WHEN** the browser requests a model switch for a session that is not live and continuable
- **THEN** the backend SHALL reject the request with a reason tied to session continuity
- **AND** no ACP `session/set_config_option` request SHALL be sent

### Requirement: Configuration changes are synchronized in realtime
The system SHALL synchronize session configuration changes to connected browsers without requiring a page reload.

#### Scenario: User-initiated switch succeeds
- **WHEN** a user-initiated configuration change succeeds for a session
- **THEN** the backend SHALL emit a realtime session configuration update for that local session
- **AND** browsers showing that session SHALL update the model selector and compact metadata

#### Scenario: Agent sends configuration option update
- **WHEN** the owning ACP agent sends a `session/update` notification with `sessionUpdate` equal to `config_option_update`
- **THEN** the backend SHALL map the ACP session id to the owning local session
- **AND** it SHALL persist the complete configuration option state from the notification
- **AND** it SHALL emit a realtime update for that local session

#### Scenario: Update belongs to unknown session
- **WHEN** an ACP configuration update references an ACP session id that is not mapped to a local session
- **THEN** the backend SHALL ignore the update for browser state
- **AND** it SHALL not modify any persisted local session configuration

### Requirement: Session lists expose current model summary
The system SHALL include compact current-model metadata in session list rows when a session has a model projection.

#### Scenario: Listed session has current model metadata
- **WHEN** the browser loads a workspace session list containing a session with persisted model metadata
- **THEN** the backend SHALL include the compact current-model projection in that list row
- **AND** the browser SHALL display the model summary without loading full configuration option payloads

#### Scenario: Model changes while session list is visible
- **WHEN** the browser is showing a session list and receives a realtime configuration update for a listed session
- **THEN** it SHALL update that row's current model summary
- **AND** it SHALL keep the row's existing status, approval, review, and continuity metadata intact

#### Scenario: Listed session has no model metadata
- **WHEN** the browser loads a session list row for a session without a model projection
- **THEN** it SHALL omit model summary UI for that row
- **AND** the row SHALL remain navigable and otherwise unchanged

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

### Requirement: Claude ACP mode controls preserve local permission risk state
The system SHALL preserve the creation-time local permission mode while rendering Claude ACP session mode controls as session configuration state.

#### Scenario: Claude session exposes ACP mode control
- **WHEN** a Claude session detail response includes an ACP configuration option with id `mode`
- **THEN** the browser SHALL render it as a session-scoped control when the session is otherwise configurable
- **AND** the persisted local permission-mode badge SHALL remain based on the session's creation-time permission mode

#### Scenario: Claude YOLO session is rendered
- **WHEN** a Claude session has persisted local permission mode `yolo`
- **THEN** the browser SHALL show the persistent YOLO warning in Session Detail
- **AND** the Sessions list SHALL distinguish it from normal approval-managed sessions

#### Scenario: User changes Claude ACP mode after creation
- **WHEN** the user changes the Claude ACP `mode` session control after creation
- **THEN** the backend SHALL persist the returned ACP configuration option snapshot
- **AND** it SHALL NOT rewrite the session's persisted local permission mode

