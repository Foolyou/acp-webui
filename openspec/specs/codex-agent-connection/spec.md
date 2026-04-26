# codex-agent-connection Specification

## Purpose
TBD - created by archiving change add-initial-codex-session-flow. Update Purpose after archive.
## Requirements
### Requirement: Codex ACP process can be started

The system SHALL provide a backend-managed Codex agent connection using `codex-acp` over stdio.

#### Scenario: Backend starts Codex ACP

- **WHEN** the backend starts with Codex support enabled
- **THEN** it SHALL be able to launch the configured `codex-acp` command as a child process
- **AND** it SHALL keep the process stdin and stdout connected for ACP JSON-RPC communication

#### Scenario: Codex ACP launch fails

- **WHEN** the configured `codex-acp` command cannot be launched
- **THEN** the backend SHALL expose a failed Codex connection status to the browser
- **AND** it SHALL include a human-readable error message suitable for local troubleshooting

### Requirement: Codex ACP connection can be initialized

The system SHALL initialize ACP communication with the Codex ACP process before creating sessions or sending prompts.

#### Scenario: ACP initialization succeeds

- **WHEN** the Codex ACP process is running and responds to initialization
- **THEN** the backend SHALL mark the Codex connection as ready
- **AND** subsequent workspace session creation SHALL be allowed

#### Scenario: ACP initialization fails

- **WHEN** the Codex ACP process exits or returns an initialization error
- **THEN** the backend SHALL mark the Codex connection as failed
- **AND** session creation through that connection SHALL be rejected with an explanatory error

### Requirement: Browser can observe Codex connection status

The system SHALL expose the current Codex connection status to the browser.

#### Scenario: Browser loads initial app state

- **WHEN** the browser requests initial application state
- **THEN** the response SHALL include whether the Codex connection is starting, ready, or failed

#### Scenario: Codex connection status changes

- **WHEN** the Codex connection changes state after the browser is connected
- **THEN** the browser SHALL receive an updated connection status without requiring a full page reload

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
