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

### Requirement: Codex ACP launch honors permission mode
The system SHALL launch Codex ACP with configuration that matches the selected session permission mode.

#### Scenario: Codex manual runtime starts
- **WHEN** a user action first requires a Codex runtime for permission mode `manual`
- **THEN** the backend SHALL launch Codex ACP with the existing configured command and args
- **AND** Codex permission requests SHALL continue to flow through the ACP permission approval model

#### Scenario: Codex full-auto runtime starts
- **WHEN** a user action first requires a Codex runtime for permission mode `full_auto`
- **THEN** the backend SHALL launch Codex ACP with configuration equivalent to Codex CLI full-auto behavior
- **AND** the runtime SHALL remain sandboxed according to Codex full-auto semantics

#### Scenario: Codex YOLO runtime starts
- **WHEN** a user action first requires a Codex runtime for permission mode `yolo`
- **THEN** the backend SHALL launch Codex ACP with configuration equivalent to bypassing Codex approvals and sandboxing
- **AND** the runtime SHALL be reported to the browser as a YOLO runtime

#### Scenario: Mode-specific Codex launch fails
- **WHEN** Codex ACP cannot be launched or initialized for a selected permission mode
- **THEN** the backend SHALL expose a failed status for that Codex permission mode
- **AND** other Codex permission modes and other configured agents SHALL remain independently usable when ready

### Requirement: Codex permission mode mapping is explicit
The system SHALL keep Codex permission mode mappings centralized and testable.

#### Scenario: Backend builds Codex launch args
- **WHEN** the backend prepares a Codex ACP runtime for a non-manual permission mode
- **THEN** it SHALL add only the mode-specific configuration overrides needed for that mode
- **AND** it SHALL preserve user-configured Codex ACP command and base args that do not conflict with the selected mode

#### Scenario: Codex mode mapping changes in future versions
- **WHEN** the installed Codex ACP version requires a different config override shape
- **THEN** implementation tests SHALL detect the changed launch arguments or fake-runtime expectations
- **AND** unsupported mappings SHALL fail with a readable runtime error instead of silently starting in the wrong mode

