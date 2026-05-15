## ADDED Requirements

### Requirement: Agent selection starts runtime for session listing
The system SHALL start or retry an agent runtime when the user selects that agent for a workspace session list and native session discovery requires an initialized runtime.

#### Scenario: Idle agent is selected for session list
- **WHEN** the browser requests a workspace-agent session list for an available agent whose compatible runtime is idle
- **THEN** the backend SHALL launch and initialize that runtime
- **AND** it SHALL emit agent-scoped status transitions while startup is in progress
- **AND** it SHALL load the workspace-agent session projection after startup completes

#### Scenario: Failed agent is selected again
- **WHEN** the browser requests a workspace-agent session list for an available agent whose compatible runtime previously failed
- **THEN** the backend SHALL attempt to start that agent runtime again
- **AND** it SHALL replace the failed runtime status with the result of the new launch attempt

#### Scenario: Agent startup fails during list load
- **WHEN** the selected agent runtime fails during startup for session listing
- **THEN** the backend SHALL expose the agent failure through agent runtime status
- **AND** persisted sessions for that workspace and agent SHALL remain available as non-live projections when they can be read from storage
- **AND** other agents SHALL remain selectable

### Requirement: Native session list sync is isolated by agent runtime
The system SHALL sync native ACP session lists through the selected agent runtime without mixing sessions, capabilities, or external ids across agents.

#### Scenario: Agent advertises native session listing
- **WHEN** the selected agent initialization response advertises `sessionCapabilities.list`
- **THEN** the backend SHALL call ACP `session/list` for the selected workspace cwd
- **AND** it SHALL import or update returned native sessions before returning the workspace-agent session list

#### Scenario: Native list is paged
- **WHEN** ACP `session/list` returns a next cursor
- **THEN** the backend SHALL request subsequent pages until the list is exhausted or a bounded failure occurs
- **AND** imported rows SHALL remain idempotent across repeated list loads

#### Scenario: Agent does not advertise native session listing
- **WHEN** the selected agent does not advertise native session list support
- **THEN** the backend SHALL NOT call ACP `session/list`
- **AND** it SHALL return the persisted workspace-agent session list from storage

#### Scenario: Different agents report the same native session id
- **WHEN** two agent runtimes report the same external session id string
- **THEN** the backend SHALL treat them as distinct native sessions keyed by their owning agent id
- **AND** updates from one agent SHALL NOT mutate the other agent's local session projection
