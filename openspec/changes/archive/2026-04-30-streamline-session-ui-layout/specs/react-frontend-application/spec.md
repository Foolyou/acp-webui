## ADDED Requirements

### Requirement: Frontend verifies responsive workbench layout
The React frontend SHALL include browser automation coverage for the redesigned desktop and mobile workbench layouts.

#### Scenario: Desktop layout regression check runs
- **WHEN** the Playwright E2E suite exercises Session Detail on a desktop viewport
- **THEN** it SHALL verify that the page has no horizontal overflow
- **AND** it SHALL verify that the prompt composer remains compact and reachable while a long timeline is visible
- **AND** it SHALL verify that session configuration controls are available outside the permanent composer body

#### Scenario: Mobile layout regression check runs
- **WHEN** the Playwright E2E suite exercises Session Detail on a mobile viewport
- **THEN** it SHALL verify that the mobile top bar, session context, timeline, approval state, and composer do not overlap incoherently
- **AND** it SHALL verify that the composer does not consume disproportionate viewport height in idle state
- **AND** it SHALL verify that the page has no horizontal overflow

#### Scenario: Overlay layout regression check runs
- **WHEN** the Playwright E2E suite opens approval, review, or mobile navigation overlays
- **THEN** it SHALL verify that primary controls remain reachable
- **AND** it SHALL verify that overlay content does not rely on large empty space or hidden offscreen controls for the primary workflow
