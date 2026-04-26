## ADDED Requirements

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
The system SHALL persist ACP tool activity as structured tool call records.

#### Scenario: Tool call starts
- **WHEN** the backend receives an ACP tool call update for a known session
- **THEN** it SHALL create or update a tool call timeline item with tool kind or name, compact summary, status, raw payload, and timestamp
- **AND** connected browsers SHALL be able to render the item without loading a review artifact payload

#### Scenario: Tool call updates
- **WHEN** the backend receives subsequent ACP updates for the same tool call id
- **THEN** it SHALL update the existing tool call timeline item instead of creating duplicate unrelated timeline items
- **AND** it SHALL preserve enough raw data for expanded inspection

#### Scenario: Tool call produces review evidence
- **WHEN** a tool call produces diff, markdown, terminal output, or other review evidence
- **THEN** the backend SHALL link the review artifact to the related tool call when the relation is known
- **AND** the timeline item SHALL expose that drill-down evidence is available

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
