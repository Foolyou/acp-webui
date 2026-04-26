## MODIFIED Requirements

### Requirement: Unsupported ACP updates do not break the connection

The system SHALL tolerate ACP updates that are outside the initial text-only scope while forwarding supported permission requests to the approval flow and normalizing supported review evidence into session artifacts.

#### Scenario: Non-text ACP update is received

- **WHEN** Codex sends an ACP update that is not a text response update, is not a permission request, and cannot be normalized into review evidence
- **THEN** the backend SHALL avoid crashing
- **AND** it SHALL keep the session active when the update does not require user interaction

#### Scenario: Permission request is received after approval support exists

- **WHEN** Codex sends a `session/request_permission` request for a known session
- **THEN** the backend SHALL persist and broadcast the permission request through the approval flow
- **AND** it SHALL wait for user resolution instead of immediately returning a cancelled permission outcome
- **AND** it SHALL return the selected ACP option id or cancelled outcome to Codex according to the user's action

#### Scenario: Review evidence update is received

- **WHEN** Codex sends a supported non-text session update containing tool call, terminal, diff, Markdown, or artifact evidence for a known session
- **THEN** the backend SHALL normalize the update into a session review artifact
- **AND** connected browsers SHALL be able to display that evidence from Session Detail
