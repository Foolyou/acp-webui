## ADDED Requirements

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
