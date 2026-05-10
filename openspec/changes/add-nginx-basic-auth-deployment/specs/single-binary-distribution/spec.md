## ADDED Requirements

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
- **AND** it SHALL state that the deployment disables ACP Web UI pairing-token auth on the loopback-only daemon
- **AND** it SHALL warn not to expose the ACP Web UI backend port directly
