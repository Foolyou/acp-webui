## ADDED Requirements

### Requirement: Session cards expose secondary queue and review badges
Workspace cockpit session cards MAY expose queued prompt and review evidence availability as secondary status without making those states workspace attention.

#### Scenario: Queued prompt badge
- **WHEN** a session has queued follow-up prompts
- **THEN** its workspace cockpit card MAY show the queued prompt count as secondary status
- **AND** the queued prompt count SHALL NOT contribute to the pending approval attention count

#### Scenario: Review evidence badge
- **WHEN** a session has review artifacts
- **THEN** its workspace cockpit card MAY show a lightweight review evidence badge
- **AND** detailed inspection SHALL require opening Session Detail or the review viewer
