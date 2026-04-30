# session-timeline-data-model Specification

## Purpose
TBD - created by archiving change rework-session-timeline-data-model. Update Purpose after archive.
## Requirements
### Requirement: Session detail exposes normalized timeline
The system SHALL expose a backend-ordered timeline for each session detail response.

#### Scenario: Session detail contains mixed timeline items
- **WHEN** the browser loads Session Detail for a session with messages, tool calls, permission events, and review artifacts
- **THEN** the backend SHALL return a single ordered timeline containing those items
- **AND** each item SHALL include a stable id, kind, session id, timestamp, status, and render summary appropriate for its kind

#### Scenario: Existing messages are represented in timeline
- **WHEN** a persisted session has user, assistant, or system messages
- **THEN** the backend SHALL represent those messages as timeline items without losing role, content, status, or creation timestamp

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
- **THEN** the timeline item SHALL still expose the existing tool kind or name, title, summary, status, raw input, and raw output
- **AND** the browser SHALL be able to render a useful fallback row without failing

### Requirement: Session continuity is explicit
The system SHALL expose whether a persisted session can continue using live Codex ACP context.

#### Scenario: Session can continue
- **WHEN** the backend has an active ACP runtime mapping for a session
- **THEN** session detail and list projections SHALL mark the session as continuable
- **AND** `viewOnlyReason` SHALL be absent or null

#### Scenario: Session cannot continue after restart
- **WHEN** the browser loads a persisted session whose ACP runtime context is unavailable
- **THEN** session detail and list projections SHALL mark the session as not continuable
- **AND** they SHALL include a readable `viewOnlyReason`

### Requirement: Workspace-scoped session projection is available
The system SHALL provide sessions scoped to a workspace.

#### Scenario: Workspace sessions are requested
- **WHEN** the browser requests sessions for a workspace
- **THEN** the backend SHALL return only sessions belonging to that workspace ordered by most recent activity first
- **AND** each row SHALL include session identity, status, continuity metadata, pending approval summary, review evidence availability, and last activity timestamp

#### Scenario: Unknown workspace sessions are requested
- **WHEN** the browser requests sessions for a workspace that does not exist
- **THEN** the backend SHALL return a not-found response
- **AND** it SHALL NOT return sessions from other workspaces

### Requirement: Timeline updates are delivered in realtime
The system SHALL broadcast realtime timeline item changes for sessions with active browser connections.

#### Scenario: Tool timeline item changes
- **WHEN** a tool call timeline item is created or updated for a session
- **THEN** connected browsers SHALL receive a realtime event containing enough data to upsert that timeline item

#### Scenario: Assistant text completes
- **WHEN** an assistant message is persisted after a running turn
- **THEN** connected browsers SHALL receive a realtime event that can complete or replace the corresponding live timeline state

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

### Requirement: Tool call timeline items expose display projection data
The backend SHALL expose enough structured tool call display data for clients to render concise activity rows without relying only on raw ACP payload inspection.

#### Scenario: Tool call display projection is available
- **WHEN** the backend can derive tool activity display data from a tool call record
- **THEN** the session timeline item SHALL expose display data that identifies the display kind, action label or verb, subject, status, and compact result where available
- **AND** existing raw input, raw output, tool kind, title, summary, and review artifact identifiers SHALL remain available for compatibility

#### Scenario: Display projection cannot be derived
- **WHEN** the backend cannot derive stable display data for a tool call
- **THEN** the session timeline item SHALL still include the existing raw and summary fields
- **AND** the browser SHALL have enough data to render a generic fallback row and diagnostics

#### Scenario: Projection is additive
- **WHEN** display projection fields are introduced to tool call timeline items
- **THEN** the fields SHALL be optional or backward-compatible for existing clients
- **AND** persisted raw tool call records SHALL not require destructive migration

### Requirement: Tool call timeline items expose evidence summaries
The backend SHALL identify tool-call-related evidence in the timeline response so the browser can render typed evidence actions.

#### Scenario: Tool call has review artifacts
- **WHEN** a tool call is linked to one or more review artifacts
- **THEN** the tool call timeline item SHALL expose evidence summary data or review artifact identifiers sufficient to render drill-down actions
- **AND** the evidence data SHALL distinguish terminal output, diff, Markdown, generic artifact, or unknown evidence when that kind is known

#### Scenario: Tool call has command output metadata
- **WHEN** command execution output, exit status, or duration metadata is available
- **THEN** the timeline item SHALL expose bounded output preview and result metadata suitable for concise rendering
- **AND** full output SHALL remain available through raw output or a review artifact when persisted

#### Scenario: Realtime tool call update changes evidence state
- **WHEN** a realtime tool call update adds output, failure, completion, or evidence links
- **THEN** the realtime timeline item upsert SHALL include enough updated display and evidence data for the browser to update the existing row in place

