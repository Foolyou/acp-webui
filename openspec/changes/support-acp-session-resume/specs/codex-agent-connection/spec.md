## MODIFIED Requirements

### Requirement: Codex resume support is investigated before use
The system SHALL continue persisted Codex sessions only through verified ACP session continuation capabilities exposed by `codex-acp`.

#### Scenario: Persisted ACP session id exists after restart
- **WHEN** the backend starts and finds sessions with persisted ACP session ids
- **THEN** it SHALL NOT assume those sessions are continuable solely because an ACP session id exists
- **AND** it SHALL expose them as restorable only when the active Codex ACP connection advertises a verified load or resume capability
- **AND** it SHALL expose them as view-only when no verified continuation path is available

#### Scenario: Codex ACP load capability is available
- **WHEN** the Codex ACP initialization response advertises `loadSession: true`
- **THEN** the backend SHALL be able to restore an eligible persisted Codex session by calling `session/load`
- **AND** it SHALL use the persisted ACP session id, the session workspace path, and the configured MCP server list for the load request

#### Scenario: Codex ACP load succeeds
- **WHEN** `session/load` completes successfully for a persisted Codex session
- **THEN** the backend SHALL register the ACP session id with the local session id
- **AND** it SHALL allow subsequent prompts through the normal `session/prompt` flow when the session is otherwise idle

#### Scenario: Codex ACP load fails
- **WHEN** `session/load` returns an error for a persisted Codex session
- **THEN** the backend SHALL keep the local session history available for review
- **AND** it SHALL keep the session non-continuable with a readable restore failure reason
