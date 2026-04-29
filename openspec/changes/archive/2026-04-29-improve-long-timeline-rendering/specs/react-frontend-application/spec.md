## ADDED Requirements

### Requirement: Frontend guards long-timeline prompt responsiveness
The React frontend SHALL include browser automation coverage that detects prompt input responsiveness regressions when Session Detail renders a long timeline.

#### Scenario: Performance regression coverage runs against a long timeline
- **WHEN** the Playwright E2E suite runs for the React frontend
- **THEN** it SHALL exercise a Session Detail view with a large rendered timeline
- **AND** it SHALL type into the enabled prompt composer
- **AND** it SHALL fail if typing latency exceeds a conservative threshold that would indicate user-visible input lag

#### Scenario: Regression coverage preserves existing session behavior
- **WHEN** the long-timeline responsiveness test runs
- **THEN** it SHALL keep the session timeline visible rather than hiding the content under test
- **AND** it SHALL verify that the composer remains enabled and usable
