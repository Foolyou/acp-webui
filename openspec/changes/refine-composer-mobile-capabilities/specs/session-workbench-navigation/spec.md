## ADDED Requirements

### Requirement: Mobile workbench exposes fullscreen utility control
The mobile frontend SHALL keep browser fullscreen entry and exit reachable from workbench chrome when the current browser supports fullscreen entry, without moving the control into the prompt composer.

#### Scenario: Mobile fullscreen control is reachable
- **WHEN** the workbench renders on a mobile-width viewport and the browser exposes a usable Fullscreen API
- **THEN** the frontend SHALL expose a fullscreen control from mobile workbench chrome or a mobile chrome overflow menu
- **AND** the control SHALL remain reachable without opening Session Detail composer actions
- **AND** it SHALL NOT overlap mobile navigation, session status, timeline content, approval controls, or composer controls

#### Scenario: Mobile fullscreen control toggles state
- **WHEN** the user activates the mobile fullscreen control while fullscreen is inactive
- **THEN** the frontend SHALL request fullscreen for the application root
- **AND** the control SHALL indicate fullscreen is active after the browser confirms the state change

#### Scenario: Mobile fullscreen control exits state
- **WHEN** the user activates the mobile fullscreen control while the application is fullscreen
- **THEN** the frontend SHALL request fullscreen exit
- **AND** the control SHALL indicate fullscreen is inactive after the browser confirms the state change
