## ADDED Requirements

### Requirement: Workbench fullscreen mode
The frontend SHALL provide a browser fullscreen control for the workbench shell
when the current browser supports fullscreen entry.

#### Scenario: User enters fullscreen mode
- **WHEN** the user activates the fullscreen control while no fullscreen element
  is active
- **THEN** the frontend SHALL request fullscreen for the application root
- **AND** the control SHALL indicate that fullscreen mode is active after the
  browser confirms the state change

#### Scenario: User exits fullscreen mode
- **WHEN** the user activates the fullscreen control while the application is
  fullscreen
- **THEN** the frontend SHALL request fullscreen exit
- **AND** the control SHALL indicate that fullscreen mode is inactive after the
  browser confirms the state change

#### Scenario: Browser fullscreen support is unavailable
- **WHEN** the browser does not expose a usable Fullscreen API
- **THEN** the frontend SHALL avoid presenting an enabled fullscreen action

#### Scenario: Fullscreen state changes outside the control
- **WHEN** the browser fullscreen state changes through browser chrome,
  keyboard shortcuts, or an implementation-specific event
- **THEN** the fullscreen control SHALL synchronize its active state with the
  browser's current fullscreen element

#### Scenario: Fullscreen control is available on narrow viewports
- **WHEN** the workbench renders on a mobile-width viewport
- **THEN** the fullscreen control SHALL remain reachable from the mobile
  workbench chrome without overlapping navigation or status controls
