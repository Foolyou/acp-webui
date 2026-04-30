## MODIFIED Requirements

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

## ADDED Requirements

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
