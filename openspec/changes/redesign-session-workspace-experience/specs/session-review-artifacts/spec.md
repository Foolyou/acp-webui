## MODIFIED Requirements

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
The system SHALL support previewing Markdown artifacts from session review.

#### Scenario: Markdown artifact is opened
- **WHEN** the user opens a Markdown review artifact from Session Detail
- **THEN** the browser SHALL show a viewport-appropriate preview of the rendered Markdown with a fixed close affordance
- **AND** it SHALL preserve access to the raw artifact content for inspection

### Requirement: Terminal output can be reviewed
The system SHALL support terminal output review without turning the timeline into a raw log.

#### Scenario: Terminal output artifact is shown in the timeline
- **WHEN** terminal output evidence is available for a session
- **THEN** the timeline SHALL show a compact tool row, tail snippet, or compact summary
- **AND** the user SHALL be able to open the full terminal output in a drill-down viewer with fixed close controls
