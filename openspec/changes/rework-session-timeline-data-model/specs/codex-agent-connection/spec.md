## MODIFIED Requirements

### Requirement: Unsupported ACP updates do not break the connection

The system SHALL tolerate ACP updates that are outside the initial text-only scope while forwarding supported permission requests to the approval flow and normalizing supported review and tool evidence into session timeline data.

#### Scenario: Non-text ACP update is received

- **WHEN** Codex sends an ACP update that is not a text response update, is not a permission request, and cannot be normalized into tool activity or review evidence
- **THEN** the backend SHALL avoid crashing
- **AND** it SHALL keep the session active when the update does not require user interaction

#### Scenario: Permission request is received after approval support exists

- **WHEN** Codex sends a `session/request_permission` request for a known session
- **THEN** the backend SHALL persist and broadcast the permission request through the approval flow
- **AND** it SHALL wait for user resolution instead of immediately returning a cancelled permission outcome
- **AND** it SHALL return the selected ACP option id or cancelled outcome to Codex according to the user's action

#### Scenario: Tool activity update is received

- **WHEN** Codex sends a supported tool call or tool call update for a known session
- **THEN** the backend SHALL normalize the update into a structured tool call timeline item
- **AND** connected browsers SHALL be able to display compact tool activity from Session Detail

#### Scenario: Review evidence update is received

- **WHEN** Codex sends a supported non-text session update containing terminal, diff, Markdown, or artifact evidence for a known session
- **THEN** the backend SHALL normalize the update into session review evidence linked to the related timeline item when possible
- **AND** connected browsers SHALL be able to display that evidence from Session Detail

## ADDED Requirements

### Requirement: Codex resume support is investigated before use
The system SHALL not promise continuation of persisted sessions through Codex resume until the ACP integration has a verified resume contract.

#### Scenario: Persisted ACP session id exists after restart
- **WHEN** the backend starts and finds sessions with persisted ACP session ids
- **THEN** it SHALL NOT assume those sessions are continuable solely because an ACP session id exists
- **AND** it SHALL expose them as view-only unless live runtime context or verified resume support is available

#### Scenario: Resume capability spike is completed
- **WHEN** the implementation investigates Codex resume support
- **THEN** it SHALL document whether `codex-acp` exposes a stable resume method, what identifier it requires, and whether local Web UI session ids can map to Codex transcript context
