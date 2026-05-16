## ADDED Requirements

### Requirement: Session Detail uses inline approval panel
Session Detail SHALL present pending permission requests through a prominent sticky inline approval panel near the main session controls rather than a modal bottom sheet.

#### Scenario: Active approval is visible in Session Detail
- **WHEN** the current session has a pending permission request
- **THEN** Session Detail SHALL render an inline approval panel with the request title, kind, workspace, agent, tool summary, and available decision options
- **AND** the panel SHALL remain visible near the main controls while preserving access to timeline context

#### Scenario: Queued approvals are summarized
- **WHEN** multiple approvals are pending for the current session
- **THEN** Session Detail SHALL show only the active approval as actionable
- **AND** it SHALL show the queued approval count for the remaining approvals
