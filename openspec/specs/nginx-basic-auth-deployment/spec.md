# nginx-basic-auth-deployment Specification

## Purpose
TBD - created by archiving change add-nginx-basic-auth-deployment. Update Purpose after archive.
## Requirements
### Requirement: Linux deployment configures Nginx Basic Auth reverse proxy
The system SHALL provide a Linux deployment workflow that exposes ACP Web UI through Nginx with Basic Auth while keeping the ACP Web UI daemon bound to loopback.

#### Scenario: One command prepares reverse proxy deployment
- **WHEN** an operator runs the Linux Nginx deployment workflow with a server name and Basic Auth user
- **THEN** the workflow SHALL start or prepare the embedded release daemon on `127.0.0.1`
- **AND** it SHALL write an Nginx server configuration that proxies to the loopback daemon
- **AND** it SHALL create or update a Basic Auth password file for the configured user

#### Scenario: Backend port is not exposed by the deployment
- **WHEN** the deployment workflow starts ACP Web UI
- **THEN** it SHALL pass a loopback bind host to the release runner
- **AND** it SHALL pass auth disablement to the loopback-only release runner
- **AND** it SHALL NOT configure ACP Web UI to bind to a wildcard or public network address

### Requirement: Nginx proxy supports frontend, API, and realtime traffic
The generated Nginx configuration SHALL proxy ACP Web UI HTTP and WebSocket traffic to the loopback daemon.

#### Scenario: WebSocket upgrade headers are configured
- **WHEN** the generated Nginx configuration proxies requests to ACP Web UI
- **THEN** it SHALL use HTTP/1.1 for upstream proxying
- **AND** it SHALL forward the `Upgrade` header
- **AND** it SHALL set a `Connection` value suitable for WebSocket upgrade requests

#### Scenario: Long running realtime sessions remain connected
- **WHEN** a browser keeps an ACP Web UI realtime connection open through Nginx
- **THEN** the generated Nginx configuration SHALL set proxy read and send timeouts long enough for interactive sessions

### Requirement: Deployment validates and reloads Nginx safely
The deployment workflow SHALL validate generated Nginx configuration before activating it.

#### Scenario: Invalid Nginx configuration is rejected
- **WHEN** the generated Nginx configuration is invalid
- **THEN** the workflow SHALL fail before reloading Nginx
- **AND** it SHALL report that the Nginx configuration test failed

#### Scenario: Valid Nginx configuration is activated
- **WHEN** the generated Nginx configuration is valid
- **THEN** the workflow SHALL reload or start Nginx so the reverse proxy becomes available

### Requirement: Deployment can configure HTTPS when requested
The deployment workflow SHALL support optional Let's Encrypt certificate setup for a configured domain.

#### Scenario: HTTPS is requested
- **WHEN** the operator requests certificate setup with a domain and email
- **THEN** the workflow SHALL invoke Certbot for the configured Nginx server name
- **AND** it SHALL leave Nginx configured to serve the deployment over HTTPS when certificate issuance succeeds

#### Scenario: HTTPS is skipped
- **WHEN** the operator skips certificate setup
- **THEN** the workflow SHALL still produce a usable Nginx HTTP reverse proxy protected by Basic Auth

### Requirement: Deployment output explains access and credentials
The deployment workflow SHALL print enough information for the operator to access and manage the deployed service.

#### Scenario: Deployment completes
- **WHEN** the deployment workflow completes successfully
- **THEN** it SHALL print the configured public URL
- **AND** it SHALL print the Basic Auth username
- **AND** it SHALL print relevant Nginx config and password file paths
- **AND** it SHALL print the local ACP Web UI upstream URL

