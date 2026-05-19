## ADDED Requirements

### Requirement: Binary provides device approval administration commands
ACP Web UI SHALL include single-binary administrator commands for listing pending device pairing requests and approving an unexpired request.

#### Scenario: Administrator lists pending device requests
- **WHEN** an administrator runs the pending device request listing command against the application work directory
- **THEN** the binary opens the configured database and prints unexpired pending requests without starting the HTTP server

#### Scenario: Administrator approves a device request
- **WHEN** an administrator runs the approve command with an unexpired device pairing request code
- **THEN** the binary records the approval in the configured database without starting the HTTP server

#### Scenario: Administrator command uses configured state
- **WHEN** an administrator command is run with `--work-dir` or `ACP_WEBUI_WORK_DIR`
- **THEN** it uses the same database resolution rules as the daemon

## MODIFIED Requirements

### Requirement: Release documentation includes Linux Nginx deployment
ACP Web UI documentation SHALL describe how to deploy the embedded single-binary release behind Nginx with Basic Auth on Linux.

#### Scenario: User finds one-command Nginx deployment
- **WHEN** a user reads the release documentation
- **THEN** the documentation SHALL show a Linux command that starts the local release and configures Nginx Basic Auth reverse proxying
- **AND** it SHALL identify required inputs such as server name, Basic Auth user, and optional certificate email

#### Scenario: User understands reverse proxy security model
- **WHEN** a user reads the Nginx deployment documentation
- **THEN** the documentation SHALL state that ACP Web UI remains bound to loopback
- **AND** it SHALL state that Nginx Basic Auth is the remote access boundary for this deployment topology
- **AND** it SHALL state that the deployment disables ACP Web UI device approval auth on the loopback-only daemon
- **AND** it SHALL warn not to expose the ACP Web UI backend port directly
