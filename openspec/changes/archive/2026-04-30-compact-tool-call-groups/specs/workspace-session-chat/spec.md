## MODIFIED Requirements

### Requirement: Session timeline includes review artifact cards
The system SHALL keep session review evidence reachable inside Session Detail while allowing linked artifacts to appear as evidence actions on related tool activity instead of always rendering as standalone cards.

#### Scenario: Session detail includes standalone review artifact summaries
- **WHEN** the browser loads Session Detail for a session with review artifacts that are not linked to a visible tool activity row
- **THEN** the timeline SHALL render compact review artifact cards among the conversation entries
- **AND** each card SHALL identify the artifact kind, title, summary, and source session context

#### Scenario: Session detail includes linked review artifact summaries
- **WHEN** the browser loads Session Detail for a session with review artifacts linked to visible tool activity
- **THEN** the timeline SHALL make those artifacts reachable from the related tool activity row or expanded tool group
- **AND** it SHALL avoid duplicating the same linked artifact as a standalone default card

#### Scenario: Review artifact card or evidence action is opened
- **WHEN** the user selects a review artifact card or a linked evidence action in the timeline
- **THEN** the browser SHALL open a full-screen drill-down scoped to the current session
- **AND** returning from the drill-down SHALL preserve the Session Detail conversation context

#### Scenario: Session has no review artifacts
- **WHEN** the browser loads Session Detail for a session with no review artifacts
- **THEN** the timeline SHALL continue to show chat, live status, and approval state without an empty review section
