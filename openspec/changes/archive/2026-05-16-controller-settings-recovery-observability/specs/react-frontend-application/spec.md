## ADDED Requirements

### Requirement: Browser recovers projections after reconnect
The browser SHALL reload current controller projections after reload, websocket reconnect, mobile backgrounding, or network switching.

#### Scenario: Websocket reconnects
- **WHEN** the websocket reconnects after a disconnect
- **THEN** the browser SHALL refresh app state, workspaces, inbox, the current workspace session list, and the current session detail when present
- **AND** pending approval, queued prompt, and review projections SHALL reflect the latest backend state

#### Scenario: Browser becomes visible or online
- **WHEN** the browser returns from a hidden state or receives an online event
- **THEN** the browser SHALL perform the same projection recovery
- **AND** it SHALL avoid applying stale recovery responses over newer route state

### Requirement: Durable event replay is deferred
The first reconnect reliability target SHALL be projection recovery and SHALL NOT require durable normalized event logging with cursor-based replay.

#### Scenario: Recovery without replay cursor
- **WHEN** the browser recovers after missed realtime events
- **THEN** it SHALL use current REST projections to repair visible state
- **AND** it SHALL NOT require a realtime replay cursor for the first version
