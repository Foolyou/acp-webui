## MODIFIED Requirements

### Requirement: Unsupported ACP updates do not break the connection

The system SHALL tolerate ACP updates that are outside the initial text-only scope while forwarding supported permission requests to the approval flow.

#### Scenario: Non-text ACP update is received

- **WHEN** Codex sends an ACP update that is not a text response update and is not a permission request
- **THEN** the backend SHALL avoid crashing
- **AND** it SHALL keep the session active when the update does not require user interaction

#### Scenario: Permission request is received after approval support exists

- **WHEN** Codex sends a `session/request_permission` request for a known session
- **THEN** the backend SHALL persist and broadcast the permission request through the approval flow
- **AND** it SHALL wait for user resolution instead of immediately returning a cancelled permission outcome
- **AND** it SHALL return the selected ACP option id or cancelled outcome to Codex according to the user's action
