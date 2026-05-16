## ADDED Requirements

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
