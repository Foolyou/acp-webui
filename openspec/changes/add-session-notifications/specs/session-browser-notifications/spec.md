## ADDED Requirements

### Requirement: User can enable browser notifications
The frontend SHALL provide an opt-in browser notification affordance when the
current browser supports the Notification API.

#### Scenario: Browser notifications are supported
- **WHEN** the browser exposes notification support and permission is not denied
- **THEN** the frontend SHALL present a user-activated control to request or use
  notification permission

#### Scenario: User grants notification permission
- **WHEN** the user activates notification enablement and the browser grants
  permission
- **THEN** the frontend SHALL mark notifications as enabled for the current
  browser context

#### Scenario: Browser notifications are unsupported or denied
- **WHEN** notifications are unsupported or the browser permission is denied
- **THEN** the frontend SHALL avoid presenting an enabled notification action
- **AND** normal session realtime behavior SHALL continue without notification
  delivery

### Requirement: Permission request notifications
The frontend SHALL notify the user when a session receives a permission request
and browser notification permission is granted.

#### Scenario: Permission request arrives
- **WHEN** a realtime `permission_requested` event is received
- **AND** browser notifications are enabled
- **THEN** the frontend SHALL show a browser notification indicating that
  approval is needed
- **AND** the notification body SHALL identify the permission request when a
  title is available

#### Scenario: Permission notifications remain scoped
- **WHEN** realtime events other than permission requests are received
- **THEN** the frontend SHALL NOT show a permission-request notification for
  those events

### Requirement: Turn completion notifications
The frontend SHALL notify the user when an agent turn completes and browser
notification permission is granted.

#### Scenario: Running turn completes
- **WHEN** the current session transitions from an active running or stopping
  turn to no active turn with an idle session status
- **AND** browser notifications are enabled
- **THEN** the frontend SHALL show a browser notification indicating that the
  session turn is complete

#### Scenario: Streaming events do not notify
- **WHEN** assistant text deltas, assistant messages, tool updates, or timeline
  updates arrive while a turn remains active
- **THEN** the frontend SHALL NOT show a turn-completion notification

#### Scenario: Completion notifications are not duplicated
- **WHEN** multiple realtime or reconcile updates describe the same completed
  turn
- **THEN** the frontend SHALL show at most one completion notification for that
  turn transition
