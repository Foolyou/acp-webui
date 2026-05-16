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
- **THEN** the timeline item SHALL still expose the existing tool kind or name, neutral fallback title, summary, status, raw input, and raw output
- **AND** the neutral fallback title SHALL NOT classify the item as permission or approval activity by itself
- **AND** the browser SHALL be able to render a useful fallback row without failing

#### Scenario: Permission request display data cannot be derived
- **WHEN** a permission request payload does not contain recognizable command display data
- **THEN** the permission request projection MAY use a permission-specific fallback title
- **AND** generic tool call timeline items SHALL continue using neutral fallback display data

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

### Requirement: Message timeline items expose structured content blocks
The system SHALL expose structured message content blocks for session timeline messages while preserving text fallback content for compatibility.

#### Scenario: Message contains structured text and image blocks
- **WHEN** a persisted user or assistant message contains structured content blocks
- **THEN** the session detail timeline item SHALL include those content blocks in their original order
- **AND** it SHALL continue to include a text `content` field containing the message's text fallback

#### Scenario: Legacy message has only text content
- **WHEN** a persisted message has no structured content blocks
- **THEN** the session detail timeline item SHALL remain renderable as a text-only message
- **AND** clients MAY treat the existing text content as a single text block

#### Scenario: Realtime message includes image content
- **WHEN** a realtime timeline message upsert includes image content blocks
- **THEN** the browser SHALL merge the item using the same normalized timeline identity as text messages
- **AND** it SHALL render the structured blocks without requiring a full session reload

### Requirement: Completed assistant messages are finalized with turn state
The system SHALL finalize live assistant timeline messages when the prompt turn that produced them finishes, stops, fails, or is repaired as stale.

#### Scenario: Prompt turn completes
- **WHEN** an active prompt turn completes successfully
- **THEN** any assistant message persisted as `running` for that turn SHALL be updated to `idle`
- **AND** connected browsers SHALL receive enough realtime timeline data to render the completed assistant message without a running indicator

#### Scenario: Prompt turn is stopped or fails
- **WHEN** an active prompt turn is stopped or fails after assistant content has been persisted
- **THEN** the persisted assistant message SHALL no longer remain indefinitely `running`
- **AND** session detail SHALL remain reviewable with the final available assistant content

### Requirement: Stale running session state is repaired
The system SHALL repair persisted session rows that claim active work without active-turn metadata when no pending approval blocks repair.

#### Scenario: Backend starts with stale running session
- **WHEN** the backend starts and finds a session with status `running` or `stopping`, no active-turn metadata, and no pending permission request
- **THEN** it SHALL repair the session to a non-running state
- **AND** it SHALL finalize any running assistant message that no active turn can still own

#### Scenario: Stale session has queued prompts
- **WHEN** a stale running session has queued prompts behind the missing active turn
- **THEN** the backend SHALL avoid silently dispatching those queued prompts as if the missing turn completed normally
- **AND** session detail SHALL expose queue state that is not blocked by a false active-turn indicator
