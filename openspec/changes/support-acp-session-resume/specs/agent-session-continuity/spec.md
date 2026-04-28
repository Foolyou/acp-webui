## ADDED Requirements

### Requirement: Agent session capabilities are discovered
The system SHALL discover and retain the connected agent's session continuation capabilities before marking persisted sessions as restorable.

#### Scenario: Agent advertises session loading
- **WHEN** the ACP agent initialization response includes `loadSession: true`
- **THEN** the backend SHALL record that existing external session ids can be restored through `session/load`
- **AND** it SHALL include that capability when projecting persisted session continuity state

#### Scenario: Agent advertises session resume
- **WHEN** the ACP agent initialization response includes `sessionCapabilities.resume`
- **THEN** the backend SHALL record that the agent supports a no-history-replay resume path
- **AND** it SHALL treat that path as distinct from `session/load`

#### Scenario: Agent does not advertise continuation support
- **WHEN** the ACP agent initialization response omits both `loadSession` and `sessionCapabilities.resume`
- **THEN** the backend SHALL NOT call optional load or resume methods for that agent
- **AND** persisted sessions without live runtime context SHALL remain view-only

### Requirement: Persisted session continuity state is projected
The system SHALL expose session continuity metadata that distinguishes live, restorable, restoring, restored, failed, and view-only sessions.

#### Scenario: Session has live runtime context
- **WHEN** a persisted session's external session id is registered with the active agent runtime
- **THEN** the backend SHALL mark the session as continuable
- **AND** it SHALL allow prompt submission when no turn or approval is blocking input

#### Scenario: Session can be loaded but is not live
- **WHEN** a persisted session has an external session id and the active agent advertises `session/load`
- **THEN** the backend SHALL expose the session as restorable rather than immediately continuable
- **AND** it SHALL provide a readable continuation state suitable for Session Detail and Sessions list

#### Scenario: Session cannot be restored
- **WHEN** a persisted session has no live runtime context and no verified continuation capability applies
- **THEN** the backend SHALL return the persisted timeline for review
- **AND** it SHALL mark the session as view-only with a readable reason

### Requirement: Persisted sessions can be loaded through ACP
The system SHALL restore eligible persisted sessions by calling the ACP `session/load` method with the persisted external session id, workspace cwd, and configured MCP servers.

#### Scenario: Load succeeds
- **WHEN** the user requests continuation for a persisted session that is loadable
- **THEN** the backend SHALL call `session/load` for the session's external session id
- **AND** it SHALL register the restored external session id with the local session id after the agent confirms the load
- **AND** it SHALL mark the session as continuable for subsequent prompts

#### Scenario: Load fails
- **WHEN** the agent returns an error while loading a persisted session
- **THEN** the backend SHALL keep the session history available for review
- **AND** it SHALL mark the session restore as failed with a readable failure reason
- **AND** it SHALL keep prompt submission disabled for that session

#### Scenario: Session id is not known by the agent
- **WHEN** `session/load` reports that the requested external session id cannot be found
- **THEN** the backend SHALL treat the local session as view-only
- **AND** it SHALL avoid retrying automatically without a new user action

### Requirement: Replayed session history is reconciled
The system SHALL reconcile ACP history replay from `session/load` with locally persisted session timeline data.

#### Scenario: Replayed message already exists locally
- **WHEN** the agent replays a user or assistant message that matches an existing local timeline entry
- **THEN** the backend SHALL avoid inserting a duplicate timeline item
- **AND** the browser SHALL continue showing one coherent message sequence

#### Scenario: Replayed tool or artifact already exists locally
- **WHEN** the agent replays a tool call, tool update, permission event, or review artifact with a known stable identifier
- **THEN** the backend SHALL update or ignore the existing local projection instead of creating duplicate evidence

#### Scenario: Replayed history includes missing completed context
- **WHEN** `session/load` replays completed history that is not already stored locally
- **THEN** the backend MAY persist normalized timeline data for that missing completed history
- **AND** it SHALL NOT re-open expired approvals or completed turn state from the replay

### Requirement: Active interrupted work is not silently resumed
The system SHALL NOT treat backend restart as a guarantee that in-flight turns, active approval responders, or partially running work can continue.

#### Scenario: Backend restarts during pending approval
- **WHEN** the backend starts and finds pending approval rows from a previous process
- **THEN** it SHALL expire those approvals according to the existing approval expiration policy
- **AND** restoring the session SHALL NOT make the old approval actions selectable again

#### Scenario: Backend restarts during running turn
- **WHEN** the backend starts and finds a session previously marked as running but without live runtime context
- **THEN** it SHALL NOT claim that the prior turn is still running
- **AND** it SHALL require a successful restore and a new user prompt before new agent work begins
