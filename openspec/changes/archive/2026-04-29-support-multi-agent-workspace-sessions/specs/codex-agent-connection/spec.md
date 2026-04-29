## MODIFIED Requirements

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
