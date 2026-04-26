## ADDED Requirements

### Requirement: Session review artifacts are persisted
The system SHALL persist review artifacts that belong to a session.

#### Scenario: Review artifact is created for a session
- **WHEN** the backend receives or derives review evidence for a known session
- **THEN** it SHALL persist a review artifact with a local id, session id, kind, title, summary, payload, source, and creation timestamp
- **AND** the artifact SHALL be available when loading that session after browser reload

#### Scenario: Review artifact is linked to a tool call
- **WHEN** review evidence includes a tool call id
- **THEN** the persisted artifact SHALL retain that tool call id
- **AND** the session review UI SHALL be able to group or label the artifact with the related tool call

### Requirement: Session review artifacts are listed for Session Detail
The system SHALL expose review artifact summaries as part of session-scoped review data.

#### Scenario: Session has review artifacts
- **WHEN** the browser loads Session Detail for a session with review artifacts
- **THEN** the backend SHALL return artifact summaries for that session
- **AND** each summary SHALL include enough information to render a timeline card without loading the full payload

#### Scenario: Browser requests artifact detail
- **WHEN** the browser requests a specific review artifact for the current session
- **THEN** the backend SHALL return the artifact payload and metadata
- **AND** it SHALL reject access when the artifact does not belong to that session

### Requirement: Review artifacts support mobile diff inspection
The system SHALL support mobile-friendly unified diff review for session evidence.

#### Scenario: Diff artifact is opened
- **WHEN** the user opens a diff review artifact from Session Detail
- **THEN** the browser SHALL show a full-screen session-scoped unified diff viewer
- **AND** it SHALL provide changed file navigation and hunk-level navigation

#### Scenario: Diff is too large for compact display
- **WHEN** a diff artifact contains more content than fits comfortably in the timeline
- **THEN** the timeline card SHALL show only a compact summary
- **AND** the full diff SHALL remain available in the drill-down viewer

### Requirement: Markdown artifacts can be previewed
The system SHALL support previewing Markdown artifacts from session review.

#### Scenario: Markdown artifact is opened
- **WHEN** the user opens a Markdown review artifact from Session Detail
- **THEN** the browser SHALL show a full-screen preview of the rendered Markdown
- **AND** it SHALL preserve access to the raw artifact content for inspection

### Requirement: Terminal output can be reviewed
The system SHALL support terminal output review without turning the timeline into a raw log.

#### Scenario: Terminal output artifact is shown in the timeline
- **WHEN** terminal output evidence is available for a session
- **THEN** the timeline SHALL show a tail snippet or compact summary
- **AND** the user SHALL be able to open the full terminal output in a drill-down viewer

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
- **THEN** the browser SHALL receive a realtime review artifact event
- **AND** it SHALL add or update the corresponding timeline card without polling

#### Scenario: Browser reconnects after artifact creation
- **WHEN** the browser reloads or reconnects after review artifacts were created
- **THEN** loading Session Detail SHALL restore the artifact summaries for that session
