## MODIFIED Requirements

### Requirement: Frontend display grouping preserves normalized timeline semantics
The frontend SHALL group consecutive completed normalized tool call timeline items for display without changing the backend timeline item contract.

#### Scenario: Completed tool calls are collapsed for display
- **WHEN** the backend returns consecutive completed `tool_call` timeline items in Session Detail
- **THEN** the frontend SHALL render those items as one collapsed display block by default
- **AND** the collapsed block SHALL show the number of completed tool calls it contains
- **AND** the group SHALL preserve the underlying item order for expanded inspection

#### Scenario: User expands completed tool call group
- **WHEN** the user activates a collapsed completed tool call group
- **THEN** the frontend SHALL reveal the grouped tool call details in timeline order
- **AND** each revealed item SHALL retain its title, summary, status, raw detail affordance, and linked review evidence affordance when available

#### Scenario: Timeline boundary item appears
- **WHEN** a message, approval, review artifact, running tool call, failed tool call, or standalone non-tool timeline item appears between completed tool calls
- **THEN** the frontend SHALL treat that item as a boundary for consecutive completed tool grouping
- **AND** tool calls on opposite sides of the boundary SHALL NOT be merged into the same displayed group

#### Scenario: Realtime tool item updates
- **WHEN** a realtime timeline item upsert adds or updates a tool call in the current session
- **THEN** the frontend SHALL recompute the affected display grouping from the normalized timeline
- **AND** the backend SHALL NOT need to send pre-grouped timeline blocks
