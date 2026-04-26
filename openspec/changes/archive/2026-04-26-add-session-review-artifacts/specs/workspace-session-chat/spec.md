## ADDED Requirements

### Requirement: Session timeline includes review artifact cards
The system SHALL present session review evidence inside the Session Detail timeline.

#### Scenario: Session detail includes review artifact summaries
- **WHEN** the browser loads Session Detail for a session with review artifacts
- **THEN** the timeline SHALL render compact review artifact cards among the conversation entries
- **AND** each card SHALL identify the artifact kind, title, summary, and source session context

#### Scenario: Review artifact card is opened
- **WHEN** the user selects a review artifact card in the timeline
- **THEN** the browser SHALL open a full-screen drill-down scoped to the current session
- **AND** returning from the drill-down SHALL preserve the Session Detail conversation context

#### Scenario: Session has no review artifacts
- **WHEN** the browser loads Session Detail for a session with no review artifacts
- **THEN** the timeline SHALL continue to show chat, live status, and approval state without an empty review section

### Requirement: Session review is not primary navigation
The system SHALL keep review evidence embedded in Session Detail rather than exposing a first-level Review destination in the first version.

#### Scenario: Browser shows primary navigation
- **WHEN** the app renders primary navigation
- **THEN** it SHALL NOT show Review as a first-level destination
- **AND** review drill-downs SHALL be reachable from session artifact cards
