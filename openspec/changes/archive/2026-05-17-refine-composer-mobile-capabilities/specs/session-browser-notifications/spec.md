## ADDED Requirements

### Requirement: Mobile workbench exposes notification enablement
The mobile frontend SHALL keep browser notification enablement reachable from workbench chrome when the current browser supports notifications and permission is not denied.

#### Scenario: Mobile notification enablement is reachable
- **WHEN** the workbench renders on a mobile-width viewport
- **AND** the browser exposes notification support
- **AND** notification permission is not denied
- **THEN** the frontend SHALL expose a notification enablement control from mobile workbench chrome or a mobile chrome overflow menu
- **AND** the control SHALL remain reachable without opening settings or composer actions
- **AND** it SHALL NOT overlap mobile navigation, session status, timeline content, approval controls, or composer controls

#### Scenario: Mobile user grants notification permission
- **WHEN** the user activates notification enablement from mobile workbench chrome
- **AND** the browser grants notification permission
- **THEN** the frontend SHALL mark notifications as enabled for the current browser context
- **AND** subsequent permission-request and turn-completion notifications SHALL follow the existing notification requirements

#### Scenario: Mobile notifications are unsupported or denied
- **WHEN** the mobile browser does not expose notification support or notification permission is denied
- **THEN** the frontend SHALL avoid presenting an enabled notification action in mobile workbench chrome
- **AND** normal realtime updates, foreground recovery, and session state rendering SHALL continue without notification delivery
