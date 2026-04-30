## ADDED Requirements

### Requirement: Agent runtimes support active turn stop requests
The system SHALL route stop requests for an active session turn through the ACP runtime that owns the session and SHALL report whether the stop request was accepted.

#### Scenario: Stop routes to owning runtime
- **WHEN** the browser requests stop for a running session
- **THEN** the backend SHALL load the session's agent id
- **AND** it SHALL send the stop or cancellation request only through that agent runtime
- **AND** it SHALL NOT send the stop request to any other configured agent runtime

#### Scenario: Owning runtime accepts stop
- **WHEN** the owning agent runtime accepts the stop or cancellation request
- **THEN** the backend SHALL expose the session turn as stopping until the runtime reports that the turn has ended
- **AND** pending queued prompts SHALL remain queued until the stopped turn reaches a dispatch-eligible idle state

#### Scenario: Owning runtime cannot stop
- **WHEN** the owning agent runtime is unavailable or does not support stopping the active turn
- **THEN** the backend SHALL return a readable stop failure reason
- **AND** it SHALL preserve the active session timeline and queued prompts
