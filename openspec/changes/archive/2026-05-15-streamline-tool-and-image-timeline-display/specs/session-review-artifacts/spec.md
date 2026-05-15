## ADDED Requirements

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

## MODIFIED Requirements

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
