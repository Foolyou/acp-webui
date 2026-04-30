# session-review-artifacts Specification

## Purpose
Define session-scoped review artifacts, including persistence, summary/detail access, mobile diff and artifact review, workspace diff fallback, and realtime restoration behavior.
## Requirements
### Requirement: Session review artifacts are persisted
The system SHALL persist review artifacts that belong to a session and link them to structured tool calls when available.

#### Scenario: Review artifact is created for a session
- **WHEN** the backend receives or derives review evidence for a known session
- **THEN** it SHALL persist a review artifact with a local id, session id, kind, title, summary, payload, source, and creation timestamp
- **AND** the artifact SHALL be available when loading that session after browser reload

#### Scenario: Review artifact is linked to a tool call
- **WHEN** review evidence includes a tool call id or can be associated with a structured tool call timeline item
- **THEN** the persisted artifact SHALL retain that tool call relation
- **AND** the session review UI SHALL be able to open the artifact from the related tool call row

### Requirement: Session review artifacts are listed for Session Detail
The system SHALL expose review artifact summaries as session-scoped drill-down evidence while avoiding duplicate default timeline rows when an artifact is already reachable from a related tool activity row.

#### Scenario: Session has review artifacts
- **WHEN** the browser loads Session Detail for a session with review artifacts
- **THEN** the backend SHALL return artifact summaries or timeline references for that session
- **AND** each summary or reference SHALL include enough information to indicate drill-down evidence without loading the full payload

#### Scenario: Linked artifact is represented by tool evidence
- **WHEN** a review artifact is linked to a tool call that is rendered inside a visible tool activity row or group
- **THEN** the browser SHALL keep the artifact reachable from that tool activity evidence affordance
- **AND** it SHALL NOT require a separate default artifact card for the same evidence in the main transcript

#### Scenario: Orphan artifact has no visible tool activity
- **WHEN** a review artifact cannot be associated with a visible tool activity row or group
- **THEN** the browser SHALL render a compact standalone artifact fallback in the timeline
- **AND** selecting it SHALL open the existing session-scoped artifact drill-down

#### Scenario: Browser requests artifact detail
- **WHEN** the browser requests a specific review artifact for the current session
- **THEN** the backend SHALL return the artifact payload and metadata
- **AND** it SHALL reject access when the artifact does not belong to that session

### Requirement: Review artifacts support mobile diff inspection
The system SHALL support mobile-friendly unified diff review for session evidence.

#### Scenario: Diff artifact is opened
- **WHEN** the user opens a diff review artifact from Session Detail
- **THEN** the browser SHALL show a session-scoped unified diff viewer in an overlay suitable for the current viewport
- **AND** it SHALL provide changed file navigation, hunk-level navigation, and a fixed close affordance

#### Scenario: Diff is too large for compact display
- **WHEN** a diff artifact contains more content than fits comfortably in the timeline
- **THEN** the timeline card or linked tool row SHALL show only a compact summary
- **AND** the full diff SHALL remain available in the drill-down viewer

### Requirement: Markdown artifacts can be previewed
The system SHALL support previewing Markdown artifacts from session review through the same sanitized Markdown rendering behavior used for session messages.

#### Scenario: Markdown artifact is opened
- **WHEN** the user opens a Markdown review artifact from Session Detail
- **THEN** the browser SHALL show a viewport-appropriate preview of the rendered Markdown with a fixed close affordance
- **AND** it SHALL preserve access to the raw artifact content for inspection

#### Scenario: Markdown artifact contains unsafe content
- **WHEN** a Markdown review artifact contains raw HTML, scripts, or unsupported Markdown content
- **THEN** the browser SHALL NOT execute unsafe content
- **AND** the preview SHALL keep readable text visible when possible

#### Scenario: Markdown artifact is long
- **WHEN** a Markdown review artifact contains more content than fits in the viewport
- **THEN** the preview SHALL remain scrollable within the review overlay
- **AND** the fixed close affordance SHALL remain reachable

### Requirement: Terminal output can be reviewed
The system SHALL support terminal output review without turning the timeline into a raw log.

#### Scenario: Terminal output artifact is shown in the timeline
- **WHEN** terminal output evidence is available for a session
- **THEN** the timeline SHALL show a compact tool row, tail snippet, or compact summary
- **AND** the user SHALL be able to open the full terminal output in a drill-down viewer with fixed close controls

### Requirement: Workspace diff fallback is available on demand
The system SHALL provide an on-demand workspace diff fallback for session review.

#### Scenario: User opens diff fallback for a session
- **WHEN** the user requests diff evidence for a session and ACP-provided diff evidence is unavailable or incomplete
- **THEN** the backend SHALL run a workspace-scoped `git diff` on demand
- **AND** it SHALL return the result as normalized session review diff data

#### Scenario: Workspace diff fallback fails
- **WHEN** the backend cannot run `git diff` for the session workspace
- **THEN** it SHALL return a readable error
- **AND** it SHALL NOT change the session status

### Requirement: Review artifacts update connected browsers
The system SHALL notify connected browsers when session review artifacts become available.

#### Scenario: Browser is viewing a session when an artifact is created
- **WHEN** the backend persists a review artifact for the current session
- **THEN** the browser SHALL receive a realtime timeline or review artifact event
- **AND** it SHALL add or update the corresponding timeline evidence affordance without polling

#### Scenario: Browser reconnects after artifact creation
- **WHEN** the browser reloads or reconnects after review artifacts were created
- **THEN** loading Session Detail SHALL restore the artifact summaries or timeline evidence references for that session

### Requirement: Tool activity rows expose typed evidence actions
The frontend SHALL expose review artifacts linked to tool calls as typed evidence actions from the corresponding tool activity row.

#### Scenario: Tool call has diff evidence
- **WHEN** a tool activity row is linked to diff evidence
- **THEN** the row SHALL provide a diff evidence action that opens the session-scoped diff review overlay
- **AND** the timeline SHALL continue to show only a compact summary rather than the full diff

#### Scenario: Tool call has Markdown evidence
- **WHEN** a tool activity row is linked to Markdown evidence
- **THEN** the row SHALL provide a Markdown evidence action that opens the sanitized Markdown review overlay
- **AND** the row SHALL not render unsafe Markdown or raw HTML directly in the timeline

#### Scenario: Tool call has terminal output evidence
- **WHEN** a tool activity row is linked to terminal output evidence
- **THEN** the row SHALL show at most a bounded output tail in the timeline
- **AND** it SHALL provide an evidence action that opens the full terminal output in a bounded review or diagnostics surface

#### Scenario: Tool call has generic artifact evidence
- **WHEN** a tool activity row is linked to evidence whose kind is unknown or generic
- **THEN** the row SHALL provide a generic artifact action with a concise label
- **AND** opening the action SHALL preserve the existing session-scoped review behavior

### Requirement: Failed tool activity surfaces actionable evidence
The frontend SHALL make failed tool activity understandable without requiring users to inspect raw payloads first.

#### Scenario: Command tool activity fails
- **WHEN** a command-like tool activity row has failed status
- **THEN** the row SHALL show failed state, bounded error or output tail when available, and an evidence or diagnostics action
- **AND** the full output SHALL remain available through terminal evidence, raw output, or diagnostics

#### Scenario: Failed tool activity appears on mobile
- **WHEN** a mobile-width viewport renders a failed tool activity row with output evidence
- **THEN** the visible error or output tail SHALL stay within the row bounds
- **AND** the row SHALL preserve access to evidence and diagnostics without overlapping the composer or adjacent timeline content

