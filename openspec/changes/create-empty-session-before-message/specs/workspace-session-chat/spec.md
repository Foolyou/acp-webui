## MODIFIED Requirements

### Requirement: User can create a session in a workspace

The system SHALL allow the user to create an agent-backed session for a workspace with visible creation feedback and a persisted permission mode.

#### Scenario: Session is created for an existing workspace

- **WHEN** the user creates a session for an existing workspace and selects an available agent and supported permission mode
- **THEN** the backend SHALL start that agent runtime for the selected permission mode if it is idle or retryable failed
- **AND** it SHALL create the ACP session through that runtime after initialization succeeds
- **AND** it SHALL persist a local session record linked to the workspace with the selected agent id and permission mode
- **AND** the browser SHALL show an optimistic chat loading state until the new session detail is available
- **AND** the browser SHALL navigate to or display the new session detail view

#### Scenario: New-session compose prompt is dispatched after session creation

- **WHEN** the browser submits New Session compose with an entered initial prompt
- **THEN** the browser SHALL create the session without sending the prompt content in the session creation request
- **AND** it SHALL submit that prompt to the newly created session through the normal prompt submission API after session creation succeeds
- **AND** the first prompt SHALL use the same persistence, timeline, and dispatch behavior as a prompt submitted to an idle existing session

#### Scenario: Session creation is requested while selected agent is starting or disabled

- **WHEN** the user tries to create a session while the selected agent connection is already starting or the selected agent is disabled
- **THEN** the backend SHALL reject the request
- **AND** the browser SHALL show the current connection status for that selected agent

#### Scenario: Session creation requests unsupported permission mode

- **WHEN** the user tries to create a session with a permission mode unsupported by the selected agent
- **THEN** the backend SHALL reject the request
- **AND** the browser SHALL show a readable mode-specific validation error

#### Scenario: Session creation takes noticeable time

- **WHEN** session creation has not completed immediately after the user starts it
- **THEN** the browser SHALL continue showing a loading chat shell or skeleton
- **AND** it SHALL avoid presenting the app as idle or merely disabling the create button

#### Scenario: Session creation omits agent id

- **WHEN** a compatible client creates a session without sending an agent id
- **THEN** the backend SHALL use the configured default agent
- **AND** it SHALL persist that resolved agent id on the session

#### Scenario: Session creation omits permission mode

- **WHEN** a compatible client creates a session without sending a permission mode
- **THEN** the backend SHALL use `manual`
- **AND** it SHALL persist `manual` on the session
