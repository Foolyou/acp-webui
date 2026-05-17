# claude-agent-connection Specification

## Purpose
TBD - created by archiving change support-multi-agent-workspace-sessions. Update Purpose after archive.
## Requirements
### Requirement: Claude ACP process can be started
The system SHALL provide a backend-managed Claude agent connection using the `@agentclientprotocol/claude-agent-acp` adapter over stdio.

#### Scenario: Backend starts Claude ACP
- **WHEN** a user action first requires the Claude agent runtime
- **THEN** it SHALL be able to launch the configured Claude ACP command as a child process
- **AND** it SHALL keep the process stdin and stdout connected for ACP JSON-RPC communication

#### Scenario: Claude ACP launch fails
- **WHEN** the configured Claude ACP command cannot be launched
- **THEN** the backend SHALL expose a failed Claude connection status to the browser
- **AND** it SHALL include a human-readable error message suitable for local troubleshooting

### Requirement: Claude ACP connection can be initialized
The system SHALL initialize ACP communication with the Claude ACP process before creating Claude sessions or sending prompts.

#### Scenario: ACP initialization succeeds
- **WHEN** the Claude ACP process is running and responds to initialization
- **THEN** the backend SHALL mark the Claude connection as ready
- **AND** it SHALL retain Claude agent info and discovered ACP capabilities
- **AND** subsequent workspace session creation with the Claude agent SHALL be allowed

#### Scenario: ACP initialization fails
- **WHEN** the Claude ACP process exits or returns an initialization error
- **THEN** the backend SHALL mark the Claude connection as failed
- **AND** session creation through the Claude agent SHALL be rejected with an explanatory error

### Requirement: Claude sessions can be created and prompted
The system SHALL support workspace sessions whose selected agent is Claude.

#### Scenario: Claude session is created for a workspace
- **WHEN** the user creates a session for an existing workspace and selects the Claude agent
- **THEN** the backend SHALL start the Claude runtime if needed
- **AND** it SHALL create an ACP session through the Claude runtime after initialization succeeds
- **AND** it SHALL persist a local session record linked to the workspace with agent id `claude`
- **AND** the browser SHALL navigate to or display the new Claude session detail view

#### Scenario: Prompt is submitted to Claude session
- **WHEN** the user submits a non-empty text prompt to an idle continuable Claude session
- **THEN** the backend SHALL persist the user prompt
- **AND** it SHALL send the prompt to Claude through ACP
- **AND** the browser SHALL show Claude assistant text, supported tool activity, permission state, and review evidence in the session timeline

### Requirement: Claude permission requests use the shared approval flow
The system SHALL handle Claude ACP permission requests through the existing ACP permission approval model.

#### Scenario: Claude requests permission for a known session
- **WHEN** the Claude ACP runtime sends `session/request_permission` for a known Claude session
- **THEN** the backend SHALL persist and broadcast the permission request through the shared approval flow
- **AND** it SHALL respond to the Claude runtime with the selected ACP option id or cancelled outcome according to the user's action

#### Scenario: Claude permission request is received for an unknown session
- **WHEN** the Claude ACP runtime sends `session/request_permission` for a session that cannot be mapped to a local Claude session
- **THEN** the backend SHALL respond to Claude with a cancelled permission outcome
- **AND** it SHALL log enough diagnostic information for local troubleshooting

### Requirement: Claude persisted sessions can be restored when load is advertised
The system SHALL restore eligible Claude sessions through ACP `session/load` when the Claude runtime advertises `loadSession`.

#### Scenario: Claude load capability is available
- **WHEN** the Claude ACP initialization response advertises `loadSession: true`
- **THEN** the backend SHALL mark persisted Claude sessions with external session ids as loadable when their runtime mapping is not live

#### Scenario: Claude session load succeeds
- **WHEN** the user restores a loadable Claude session and `session/load` succeeds
- **THEN** the backend SHALL register the Claude ACP session id with the local session id
- **AND** it SHALL reconcile replayed ACP history with the existing local timeline
- **AND** it SHALL allow subsequent prompts when the session is otherwise idle

#### Scenario: Claude session load fails
- **WHEN** `session/load` returns an error for a persisted Claude session
- **THEN** the backend SHALL keep the local session history available for review
- **AND** it SHALL keep the session non-continuable with a readable restore failure reason

### Requirement: Claude authentication gaps are reported clearly
The system SHALL treat Claude authentication as a local runtime prerequisite in this change.

#### Scenario: Claude is not authenticated
- **WHEN** the Claude adapter reports an authentication-related failure during launch, initialization, session creation, or prompting
- **THEN** the backend SHALL expose a readable Claude-specific error
- **AND** the browser SHALL indicate that the Claude runtime needs local authentication or configuration
- **AND** Codex sessions SHALL remain usable when the Codex runtime is ready

### Requirement: Claude creation applies requested permission mode before prompting
The system SHALL apply the requested Claude ACP permission mode before any initial prompt is submitted to the Claude session.

#### Scenario: Claude session is created with initial prompt and YOLO mode
- **WHEN** the user creates a Claude session with permission mode `yolo` and an initial prompt
- **THEN** the backend SHALL create the ACP session
- **AND** it SHALL set the ACP `mode` configuration option to `bypassPermissions`
- **AND** it SHALL persist the refreshed configuration option snapshot
- **AND** it SHALL submit the initial prompt only after the mode update succeeds

#### Scenario: Claude requested mode is already active
- **WHEN** the user creates a Claude session and the returned ACP `mode` option already has the mapped value
- **THEN** the backend SHALL avoid sending a redundant `session/set_config_option` request
- **AND** it SHALL continue creating and prompting the session normally

#### Scenario: Claude requested mode is unavailable
- **WHEN** the user creates a Claude session with permission mode `yolo` but the Claude ACP `mode` option does not include `bypassPermissions`
- **THEN** the backend SHALL fail session creation with a readable mode-specific error
- **AND** it SHALL NOT submit the initial prompt
- **AND** it SHALL NOT persist a local session record for the failed creation

