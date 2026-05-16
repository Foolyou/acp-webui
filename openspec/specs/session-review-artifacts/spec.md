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
The system SHALL expose review artifact summaries as session-scoped drill-down evidence while avoiding duplicate default timeline rows when an artifact is already represented by related tool activity or by a first-class image block.

#### Scenario: Session has review artifacts
- **WHEN** the browser loads Session Detail for a session with review artifacts
- **THEN** the backend SHALL return artifact summaries or timeline references for that session
- **AND** each summary or reference SHALL include enough information to indicate drill-down evidence without loading the full payload

#### Scenario: Linked non-image artifact is represented by tool evidence
- **WHEN** a non-image review artifact is linked to a tool call that is rendered inside a visible tool activity row or group
- **THEN** the browser SHALL avoid rendering a separate default artifact card for the same evidence in the main transcript
- **AND** the artifact payload SHALL remain available through the session-scoped review data model

#### Scenario: Linked image artifact is represented by visual block
- **WHEN** an image review artifact is linked to a tool call
- **THEN** the browser SHALL render the image artifact as a first-class visual timeline block
- **AND** it SHALL NOT require the linked ordinary tool activity row to appear beside the image

#### Scenario: Orphan artifact has no visible tool activity
- **WHEN** a non-image review artifact cannot be associated with a visible tool activity row or group
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
The frontend SHALL keep non-image review artifacts available through the session-scoped artifact model without rendering typed evidence action buttons in compact tool activity rows.

#### Scenario: Tool call has diff evidence
- **WHEN** a tool activity row is linked to diff evidence
- **THEN** the timeline SHALL continue to show only a compact tool summary rather than the full diff
- **AND** the diff payload SHALL remain available through the session-scoped review artifact data model

#### Scenario: Tool call has Markdown evidence
- **WHEN** a tool activity row is linked to Markdown evidence
- **THEN** the row SHALL not render unsafe Markdown, raw HTML, or a typed evidence action button directly in the timeline
- **AND** the Markdown payload SHALL remain available through the session-scoped review artifact data model

#### Scenario: Tool call has terminal output evidence
- **WHEN** a tool activity row is linked to terminal output evidence
- **THEN** the row SHALL show at most a bounded readable output tail in expanded plain text
- **AND** the full terminal payload SHALL remain available through the session-scoped review artifact data model

#### Scenario: Tool call has generic artifact evidence
- **WHEN** a tool activity row is linked to evidence whose kind is unknown or generic
- **THEN** the row SHALL avoid rendering additional artifact action buttons in the compact transcript
- **AND** the artifact payload SHALL remain available through the session-scoped review artifact data model

### Requirement: Failed tool activity surfaces actionable evidence
The frontend SHALL make failed tool activity understandable without requiring users to inspect raw payloads first.

#### Scenario: Command tool activity fails
- **WHEN** a command-like tool activity row has failed status
- **THEN** the row SHALL show failed state and bounded readable error or output text when available
- **AND** expanding the row SHALL provide enough plain-text context to understand the failure without raw JSON

#### Scenario: Failed tool activity appears on mobile
- **WHEN** a mobile-width viewport renders a failed tool activity row with output evidence
- **THEN** the visible error or output tail SHALL stay within the row bounds
- **AND** expanded readable text SHALL not overlap the composer or adjacent timeline content

### Requirement: Image artifacts can be reviewed
The system SHALL persist and expose displayed images as session review
artifacts.

#### Scenario: Image artifact is created
- **WHEN** the backend accepts an agent-requested or safely-derived image
  display for a session
- **THEN** it SHALL persist a review artifact whose kind identifies image
  evidence
- **AND** the artifact payload SHALL include the image MIME type, image data or
  durable image reference, display name, optional caption, and safe source
  metadata

#### Scenario: Session detail includes image artifact summary
- **WHEN** the browser loads Session Detail for a session with image evidence
- **THEN** the backend SHALL include an artifact summary that identifies the
  evidence as an image
- **AND** the summary SHALL avoid exposing machine-specific absolute paths as the
  primary display text

#### Scenario: Browser opens image artifact detail
- **WHEN** the browser requests a session image artifact
- **THEN** the backend SHALL return the artifact only when it belongs to the
  current session
- **AND** the response SHALL include enough data for the browser to render the
  image preview after reload

#### Scenario: Image artifact is linked to a tool call
- **WHEN** image evidence was created from a specific display-image tool or ACP
  tool call update
- **THEN** the artifact SHALL retain the related tool call id when available
- **AND** the session review UI SHALL be able to open it from the related tool
  activity row

### Requirement: Image artifacts render as first-class visual timeline blocks
The frontend SHALL render image review artifacts as visual image blocks in Session Detail instead of ordinary tool evidence controls.

#### Scenario: Linked image artifact appears in the timeline
- **WHEN** a review artifact of kind `image` is linked to a tool call
- **THEN** the browser SHALL render a standalone image block in the main timeline
- **AND** the browser SHALL suppress the linked ordinary tool row when that row would only duplicate the image display result

#### Scenario: Image block renders
- **WHEN** an image artifact summary is visible in Session Detail
- **THEN** the block SHALL show the image preview and a short description or title below the image
- **AND** the block SHALL not render the ordinary tool row controls, raw JSON, or typed evidence action buttons

#### Scenario: User opens image block
- **WHEN** the user selects an image block
- **THEN** the browser SHALL open a larger session-scoped image preview
- **AND** the preview SHALL show only the image, a short description, and the standard close affordance

### Requirement: Review evidence opens in a unified session viewer
Session Detail SHALL expose concise evidence actions from timeline entries and tool rows, and SHALL open selected evidence in a unified full-screen session-scoped review viewer.

#### Scenario: Evidence action opens viewer
- **WHEN** the user selects review evidence from a timeline entry or tool row
- **THEN** the browser SHALL open the session-scoped review viewer for that artifact
- **AND** the viewer SHALL support unified diff, changed files, terminal output, Markdown preview and source, images, and generic artifacts as available

#### Scenario: Mobile diff is single-view first
- **WHEN** the user opens a diff review artifact on mobile
- **THEN** the browser SHALL show a readable single-view diff
- **AND** side-by-side diff SHALL NOT be required for the first version

