# agent-runtime-management Specification

## Purpose
TBD - created by archiving change support-multi-agent-workspace-sessions. Update Purpose after archive.
## Requirements
### Requirement: Configured ACP agents are discoverable
The system SHALL maintain a configured catalog of ACP agents that can be used to create workspace sessions.

#### Scenario: Browser loads app state
- **WHEN** the browser requests initial application state
- **THEN** the backend SHALL return the configured ACP agents
- **AND** each agent entry SHALL include a stable id, display title, enabled state, runtime lifecycle status, and discovered session capabilities when available

#### Scenario: Agent runtime has not started
- **WHEN** an agent is available in the catalog but no operation has started its ACP runtime
- **THEN** the backend SHALL include that agent as enabled with runtime status `idle`
- **AND** the browser SHALL allow the user to choose that agent for new session creation

#### Scenario: Agent is disabled
- **WHEN** an agent is configured as disabled or cannot be made available by configuration
- **THEN** the backend SHALL include the agent as unavailable or omit it according to configuration
- **AND** the browser SHALL NOT allow new sessions to be created with that disabled agent

### Requirement: Agent runtimes are started on demand
The system SHALL start ACP agent runtimes lazily when an operation needs an available agent and a compatible launch profile.

#### Scenario: Session creation selects an idle agent
- **WHEN** the user creates a workspace session with an available agent and launch profile whose runtime status is `idle`
- **THEN** the backend SHALL launch and initialize that agent runtime using the selected launch profile
- **AND** it SHALL emit an agent-scoped status transition through `starting`
- **AND** it SHALL create the ACP session through that runtime after initialization succeeds

#### Scenario: Multiple agents are used
- **WHEN** Codex and Claude agents are both selected for sessions
- **THEN** the backend SHALL initialize separate ACP runtime connections for each agent
- **AND** each runtime SHALL maintain its own connection status, JSON-RPC peer, capability state, and in-memory session mappings

#### Scenario: One agent fails to start on demand
- **WHEN** one available agent runtime fails during launch or initialization
- **THEN** the backend SHALL expose that agent and launch profile as failed with a readable error
- **AND** other idle or ready agents and launch profiles SHALL remain usable for creating and continuing sessions

#### Scenario: Failed agent is selected again
- **WHEN** the user creates a session with an available agent and launch profile whose previous runtime status is `failed`
- **THEN** the backend SHALL attempt to start that agent runtime again
- **AND** it SHALL replace the failed runtime status with the result of the new launch attempt

### Requirement: Session operations route through the owning agent
The system SHALL route existing-session operations through the ACP runtime identified by the session's persisted agent id.

#### Scenario: Prompt is submitted to an existing session
- **WHEN** the browser submits a prompt to a session
- **THEN** the backend SHALL load the session's agent id
- **AND** it SHALL send the ACP `session/prompt` request through that agent runtime
- **AND** it SHALL reject the request if that agent runtime is not ready or the session is not continuable

#### Scenario: Session restore is requested
- **WHEN** the browser requests restoration for a persisted session
- **THEN** the backend SHALL load the session's agent id
- **AND** it SHALL evaluate and invoke the continuation path through that agent runtime only

#### Scenario: Permission request is resolved
- **WHEN** the browser resolves a pending permission request
- **THEN** the backend SHALL respond through the runtime that owns the permission request's session
- **AND** it SHALL NOT send the selected outcome to any other agent runtime

### Requirement: Agent runtime maps are isolated
The system SHALL isolate ACP session ids and pending JSON-RPC responders by agent runtime.

#### Scenario: Different agents produce the same ACP session id
- **WHEN** two agent runtimes report the same ACP session id string for different local sessions
- **THEN** the backend SHALL map each ACP session id within its owning runtime
- **AND** updates from one runtime SHALL NOT be applied to the other runtime's local session

#### Scenario: Runtime disconnects
- **WHEN** one agent runtime disconnects or exits
- **THEN** pending requests owned by that runtime SHALL fail or expire according to existing session and approval rules
- **AND** pending requests owned by other runtimes SHALL remain active

### Requirement: Existing Codex sessions migrate to the Codex agent
The system SHALL preserve existing persisted sessions by assigning them to the Codex agent.

#### Scenario: Backend migrates old session rows
- **WHEN** the backend starts or migrates storage containing sessions without a stable agent id
- **THEN** it SHALL assign those sessions to the `codex` agent
- **AND** their persisted timeline, permission history, review artifacts, external session id, and continuity metadata SHALL remain available

#### Scenario: Old client creates session without agent id
- **WHEN** a session creation request omits the agent id
- **THEN** the backend SHALL use the default agent configured for backward compatibility
- **AND** it SHALL persist the selected agent id on the new session

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

### Requirement: Runtime identity includes launch profile compatibility
The system SHALL isolate ACP runtimes by agent id and launch profile compatibility rather than by agent id alone.

#### Scenario: Same agent has incompatible launch profiles
- **WHEN** two sessions use the same agent id but incompatible launch profiles
- **THEN** the backend SHALL route them through separate ACP runtime slots
- **AND** ACP session ids, pending responders, assistant buffers, and restore maps SHALL remain isolated between those runtime slots

#### Scenario: Same agent has compatible launch profiles
- **WHEN** two sessions use the same agent id and launch-compatible profile identity
- **THEN** the backend MAY reuse a ready ACP runtime for both sessions
- **AND** each local session SHALL still keep its own persisted launch profile metadata

#### Scenario: Existing manual Codex session is routed
- **WHEN** the backend loads an existing Codex session without persisted launch profile metadata
- **THEN** it SHALL treat the session as using the default manual Codex launch profile
- **AND** it SHALL preserve the existing prompt, restore, approval, and review behavior

