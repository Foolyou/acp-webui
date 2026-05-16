## ADDED Requirements

### Requirement: Prompt turn busy state remains consistent
The system SHALL represent active prompt work with consistent session status, active-turn metadata, and approval state.

#### Scenario: Turn runs without approval
- **WHEN** a prompt turn is actively running without pending approval
- **THEN** session detail SHALL expose the session as `running`
- **AND** it SHALL include active-turn metadata for that turn

#### Scenario: Turn waits for approval
- **WHEN** a prompt turn has one or more pending permission requests
- **THEN** session detail SHALL expose the session as `waiting_approval`
- **AND** it SHALL preserve active-turn metadata so elapsed turn state can continue after approval resolution

#### Scenario: Last approval resolves while turn remains active
- **WHEN** the final pending approval for a session is resolved and active-turn metadata still exists
- **THEN** the backend SHALL return the session to `running`
- **AND** it SHALL keep the existing active-turn metadata until the turn finishes, fails, or stops

#### Scenario: Last approval resolves after active turn is gone
- **WHEN** the final pending approval for a session is resolved but no active-turn metadata exists
- **THEN** the backend SHALL NOT leave the session as `running`
- **AND** it SHALL expose the session as idle or terminal according to the persisted turn outcome

### Requirement: Queued prompts wait only behind real active work
The system SHALL enqueue follow-up prompts only when a session has a real active turn or pending approval.

#### Scenario: Follow-up submitted during active turn
- **WHEN** the user submits a prompt while active-turn metadata exists for the session
- **THEN** the backend SHALL persist the prompt in the ordered prompt queue
- **AND** it SHALL NOT send the queued prompt to ACP until the current active turn finishes and no pending approvals remain

#### Scenario: Follow-up submitted after stale running state is repaired
- **WHEN** a session was previously marked `running` without active-turn metadata and has been repaired to idle
- **THEN** a new user prompt SHALL be submitted as a new prompt turn
- **AND** it SHALL NOT be queued solely because of the stale previous session status
