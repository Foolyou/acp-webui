## ADDED Requirements

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
