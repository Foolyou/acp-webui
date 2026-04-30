## ADDED Requirements

### Requirement: Runtime slots are isolated by permission mode
The system SHALL isolate agent runtime slots by permission mode when the agent's launch behavior changes by mode.

#### Scenario: Same agent uses different permission modes
- **WHEN** the user creates Codex sessions with `manual`, `full_auto`, and `yolo` permission modes
- **THEN** the backend SHALL maintain separate runtime slots for each selected Codex permission mode
- **AND** session operations SHALL route through the runtime matching the session's persisted agent id and permission mode

#### Scenario: Same mode is reused
- **WHEN** multiple Codex sessions use the same permission mode
- **THEN** the backend MAY reuse the existing compatible Codex runtime for those sessions
- **AND** it SHALL keep ACP session mappings isolated within that runtime

#### Scenario: Runtime status is reported for a mode-sensitive agent
- **WHEN** the browser requests agent runtime status for session creation
- **THEN** the backend SHALL expose enough status information for the browser to distinguish available permission modes from unavailable ones
- **AND** a failed runtime for one permission mode SHALL NOT imply that other modes for the same agent are failed

### Requirement: Existing-session routing uses persisted permission mode
The system SHALL use a session's persisted permission mode when routing existing-session operations through an agent runtime.

#### Scenario: Prompt is submitted to an existing session
- **WHEN** the browser submits a prompt to a session with a persisted permission mode
- **THEN** the backend SHALL select the runtime matching the session's agent id and permission mode
- **AND** it SHALL reject the prompt if that compatible runtime is unavailable

#### Scenario: Session restore is requested
- **WHEN** the browser requests restoration for a persisted session
- **THEN** the backend SHALL select the runtime matching the session's agent id and permission mode
- **AND** restoration SHALL preserve the session's original permission mode

#### Scenario: Permission request is resolved
- **WHEN** the browser resolves a pending permission request
- **THEN** the backend SHALL respond through the runtime matching the permission request's session agent id and permission mode
- **AND** it SHALL NOT send the selected outcome through a runtime with a different permission mode
