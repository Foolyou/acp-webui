# codex-agent-connection Specification

## Purpose
TBD - created by archiving change add-initial-codex-session-flow. Update Purpose after archive.
## Requirements
### Requirement: Codex ACP process can be started

The system SHALL provide a backend-managed Codex agent connection using `codex-acp` over stdio as one configured ACP agent runtime.

#### Scenario: Backend starts Codex ACP

- **WHEN** a user action first requires the Codex agent runtime
- **THEN** it SHALL be able to launch the configured `codex-acp` command as a child process for the Codex agent
- **AND** it SHALL keep the process stdin and stdout connected for ACP JSON-RPC communication

#### Scenario: Codex ACP launch fails

- **WHEN** the configured `codex-acp` command cannot be launched
- **THEN** the backend SHALL expose a failed Codex connection status to the browser
- **AND** it SHALL include a human-readable error message suitable for local troubleshooting
- **AND** other configured agent runtimes SHALL remain usable when they are ready

### Requirement: Codex ACP connection can be initialized

The system SHALL initialize ACP communication with the Codex ACP process before creating Codex sessions or sending prompts to Codex sessions.

#### Scenario: ACP initialization succeeds

- **WHEN** the Codex ACP process is running and responds to initialization
- **THEN** the backend SHALL mark the Codex connection as ready
- **AND** subsequent workspace session creation with the Codex agent SHALL be allowed

#### Scenario: ACP initialization fails

- **WHEN** the Codex ACP process exits or returns an initialization error
- **THEN** the backend SHALL mark the Codex connection as failed
- **AND** session creation through the Codex agent SHALL be rejected with an explanatory error
- **AND** session creation through other ready agents SHALL remain available

### Requirement: Browser can observe Codex connection status

The system SHALL expose the current Codex connection status to the browser as one agent-specific runtime status.

#### Scenario: Browser loads initial app state

- **WHEN** the browser requests initial application state
- **THEN** the response SHALL include whether the Codex connection is starting, ready, or failed
- **AND** it SHALL identify that status with the Codex agent id

#### Scenario: Codex connection status changes

- **WHEN** the Codex connection changes state after the browser is connected
- **THEN** the browser SHALL receive an updated Codex agent status without requiring a full page reload
- **AND** the update SHALL NOT imply that other agent runtimes changed status

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

### Requirement: Codex resume support is investigated before use
The system SHALL not promise continuation of persisted sessions through Codex resume until the ACP integration has a verified resume contract.

#### Scenario: Persisted ACP session id exists after restart
- **WHEN** the backend starts and finds sessions with persisted ACP session ids
- **THEN** it SHALL NOT assume those sessions are continuable solely because an ACP session id exists
- **AND** it SHALL expose them as view-only unless live runtime context or verified resume support is available

#### Scenario: Resume capability spike is completed
- **WHEN** the implementation investigates Codex resume support
- **THEN** it SHALL document whether `codex-acp` exposes a stable resume method, what identifier it requires, and whether local Web UI session ids can map to Codex transcript context

