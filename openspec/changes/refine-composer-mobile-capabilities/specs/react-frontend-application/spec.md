## ADDED Requirements

### Requirement: Frontend verifies compact composer and mobile utility controls
The React frontend SHALL include regression coverage for the icon-led Session Detail composer and mobile workbench utility controls.

#### Scenario: Compact composer regression check runs
- **WHEN** frontend browser automation exercises Session Detail with an enabled composer
- **THEN** it SHALL verify that common composer actions render as accessible icon controls where an icon equivalent is available
- **AND** it SHALL verify that normal prompt typing and submission still work
- **AND** it SHALL verify that state, error, or disabled messaging remains readable when present

#### Scenario: Mobile composer layout regression check runs
- **WHEN** frontend browser automation exercises Session Detail on a mobile viewport with composer actions available
- **THEN** it SHALL verify that the composer remains reachable and compact in idle state
- **AND** it SHALL verify that composer controls do not overlap timeline content, approval controls, queued prompt state, or mobile workbench chrome

#### Scenario: Mobile utility control regression check runs
- **WHEN** frontend browser automation exercises the mobile workbench chrome with mocked browser support for fullscreen and notifications
- **THEN** it SHALL verify that fullscreen and notification enablement controls are reachable from mobile workbench chrome or its overflow menu
- **AND** it SHALL verify that those controls are not exposed as persistent prompt composer actions
