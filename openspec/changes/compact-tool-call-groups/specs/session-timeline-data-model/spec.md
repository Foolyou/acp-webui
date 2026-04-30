## ADDED Requirements

### Requirement: Frontend display grouping preserves normalized timeline semantics
The frontend SHALL be able to group consecutive normalized timeline items for display without changing the backend timeline item contract.

#### Scenario: Tool calls are grouped for display
- **WHEN** the backend returns consecutive `tool_call` timeline items in Session Detail
- **THEN** the frontend MAY render those items as one grouped display block
- **AND** the group SHALL preserve the underlying item order for expanded inspection

#### Scenario: Timeline boundary item appears
- **WHEN** a message or standalone non-tool timeline item appears between tool calls
- **THEN** the frontend SHALL treat that item as a boundary for consecutive tool grouping
- **AND** tool calls on opposite sides of the boundary SHALL NOT be merged into the same displayed group

#### Scenario: Realtime tool item updates
- **WHEN** a realtime timeline item upsert adds or updates a tool call in the current session
- **THEN** the frontend SHALL recompute the affected display grouping from the normalized timeline
- **AND** the backend SHALL NOT need to send pre-grouped timeline blocks
