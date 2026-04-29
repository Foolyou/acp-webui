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
The system SHALL start ACP agent runtimes lazily when an operation needs an available agent.

#### Scenario: Session creation selects an idle agent
- **WHEN** the user creates a workspace session with an available agent whose runtime status is `idle`
- **THEN** the backend SHALL launch and initialize that agent runtime
- **AND** it SHALL emit an agent-scoped status transition through `starting`
- **AND** it SHALL create the ACP session through that runtime after initialization succeeds

#### Scenario: Multiple agents are used
- **WHEN** Codex and Claude agents are both selected for sessions
- **THEN** the backend SHALL initialize separate ACP runtime connections for each agent
- **AND** each runtime SHALL maintain its own connection status, JSON-RPC peer, capability state, and in-memory session mappings

#### Scenario: One agent fails to start on demand
- **WHEN** one available agent runtime fails during launch or initialization
- **THEN** the backend SHALL expose that agent as failed with a readable error
- **AND** other idle or ready agents SHALL remain usable for creating and continuing sessions

#### Scenario: Failed agent is selected again
- **WHEN** the user creates a session with an available agent whose previous runtime status is `failed`
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

