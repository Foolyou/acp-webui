## ADDED Requirements

### Requirement: Session list exposes configuration summaries
The system SHALL include compact launch profile and current session control summaries in session list rows when available.

#### Scenario: Listed session has launch profile metadata
- **WHEN** the browser loads a workspace session list containing a session with persisted launch profile metadata
- **THEN** the backend SHALL include display-safe launch profile summary fields in that row
- **AND** the browser SHALL show important selected launch states such as non-manual permission behavior, fast speed mode, or startup reasoning effort without loading full session detail

#### Scenario: Listed session has current session control metadata
- **WHEN** the browser loads a workspace session list containing a session with compact current control metadata
- **THEN** the backend SHALL include display-safe summaries such as current model or current reasoning control values
- **AND** the browser SHALL display those summaries without including full ACP configuration option payloads

#### Scenario: Configuration changes while session list is visible
- **WHEN** the browser is showing a session list and receives a realtime session configuration update for a listed session
- **THEN** it SHALL update that row's current session control summaries
- **AND** it SHALL keep the row's existing status, approval, review, continuity, and launch profile metadata intact

#### Scenario: Listed session has no configuration metadata
- **WHEN** the browser loads a session list row without launch profile or current session control metadata
- **THEN** it SHALL omit configuration summary UI for that row
- **AND** the row SHALL remain navigable and otherwise unchanged
