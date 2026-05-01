## MODIFIED Requirements

### Requirement: Tool calls are persisted as structured timeline items
The system SHALL persist ACP tool activity as structured tool call records with enough data for concise timeline rendering and expanded inspection.

#### Scenario: Tool call starts
- **WHEN** the backend receives an ACP tool call update for a known session
- **THEN** it SHALL create or update a tool call timeline item with tool kind or name, compact summary, status, raw payload, timestamp, and display data that can identify the action and subject when available
- **AND** connected browsers SHALL be able to render the item without loading a review artifact payload

#### Scenario: Tool call updates
- **WHEN** the backend receives subsequent ACP updates for the same tool call id
- **THEN** it SHALL update the existing tool call timeline item instead of creating duplicate unrelated timeline items
- **AND** it SHALL preserve enough raw data and display data for expanded inspection and concise rendering

#### Scenario: Tool call produces review evidence
- **WHEN** a tool call produces diff, markdown, terminal output, or other review evidence
- **THEN** the backend SHALL link the review artifact to the related tool call when the relation is known
- **AND** the timeline item SHALL expose that drill-down evidence is available

#### Scenario: Tool call display data cannot be derived
- **WHEN** a tool call payload does not contain recognizable display data
- **THEN** the timeline item SHALL still expose the existing tool kind or name, neutral fallback title, summary, status, raw input, and raw output
- **AND** the neutral fallback title SHALL NOT classify the item as permission or approval activity by itself
- **AND** the browser SHALL be able to render a useful fallback row without failing

#### Scenario: Permission request display data cannot be derived
- **WHEN** a permission request payload does not contain recognizable command display data
- **THEN** the permission request projection MAY use a permission-specific fallback title
- **AND** generic tool call timeline items SHALL continue using neutral fallback display data

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

#### Scenario: Sparse completed tool calls resemble permission labels
- **WHEN** consecutive completed `tool_call` timeline items have sparse display data or a legacy title that resembles permission request text
- **THEN** the frontend SHALL still include those generic tool calls in the collapsed completed tool call group
- **AND** title text alone SHALL NOT cause a generic completed tool call to be hidden as permission bookkeeping

#### Scenario: Explicit permission bookkeeping appears beside approval state
- **WHEN** a completed `tool_call` timeline item has explicit permission or approval bookkeeping kind data and the corresponding approval state is represented elsewhere in the timeline
- **THEN** the frontend SHALL fold that duplicate bookkeeping item out of the default timeline display
- **AND** surrounding generic completed tool calls SHALL remain eligible for grouping
