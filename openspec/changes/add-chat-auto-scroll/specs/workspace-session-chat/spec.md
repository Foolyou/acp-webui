## ADDED Requirements

### Requirement: Session timeline follows new content by default
The browser SHALL keep the newest session timeline content visible by default while the user remains at or near the bottom of the conversation.

#### Scenario: Session detail loads with existing messages
- **WHEN** the browser opens a session detail view containing enough timeline content to exceed the viewport height
- **THEN** the browser SHALL scroll to the newest visible timeline content
- **AND** the prompt composer SHALL remain reachable

#### Scenario: Prompt is submitted while timeline is following
- **WHEN** the user submits a prompt while the timeline is at or near the bottom
- **THEN** the browser SHALL keep the submitted prompt visible in the session timeline
- **AND** it SHALL continue following subsequent running or assistant content for that turn

#### Scenario: Assistant content streams while timeline is following
- **WHEN** live assistant text, tool activity, approval notices, or running placeholders are appended while the timeline is following
- **THEN** the browser SHALL scroll so the newest timeline content remains visible

### Requirement: Session timeline preserves user scroll position
The browser SHALL stop automatically scrolling the session timeline when the user intentionally scrolls away from the newest conversation content.

#### Scenario: User scrolls upward during a running turn
- **WHEN** the user scrolls upward so the newest timeline content is no longer visible
- **THEN** the browser SHALL pause automatic scrolling for subsequent timeline updates
- **AND** the user's current reading position SHALL remain stable as new content arrives

#### Scenario: New content arrives while auto-scroll is paused
- **WHEN** new timeline content is appended while the user is away from the bottom
- **THEN** the browser SHALL NOT move the viewport to the newest content automatically
- **AND** it SHALL provide a visible shortcut to return to the newest content

### Requirement: Session timeline can return to automatic following
The browser SHALL provide a shortcut back to the newest session timeline content and resume automatic following once the user reaches the bottom.

#### Scenario: User activates the return-to-bottom shortcut
- **WHEN** automatic scrolling is paused and the user activates the return-to-bottom shortcut
- **THEN** the browser SHALL scroll to the newest timeline content
- **AND** it SHALL restore automatic following for subsequent updates
- **AND** the shortcut SHALL no longer be shown after the bottom is reached

#### Scenario: User manually scrolls back to the bottom
- **WHEN** automatic scrolling is paused and the user manually scrolls until the newest timeline content is visible
- **THEN** the browser SHALL restore automatic following for subsequent updates
- **AND** it SHALL hide the return-to-bottom shortcut
