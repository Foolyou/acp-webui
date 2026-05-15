## Why

Users need a repeatable way to expose ACP Web UI from a Linux host to their own devices when client IP addresses are not stable. The current release scripts can start the single binary on loopback, but configuring Nginx, HTTPS, Basic Auth, and WebSocket proxying remains manual and easy to get subtly wrong.

## What Changes

- Add a reusable Linux deployment path that starts the embedded single-binary release on `127.0.0.1` and configures Nginx as the only externally reachable entrypoint.
- Add a reusable Nginx reverse-proxy template with Basic Auth, WebSocket upgrade support, long-lived proxy timeouts, and loopback upstream proxying.
- Add a one-command Linux script that can install or validate required host tooling, write the Nginx config, create or update an htpasswd file, reload Nginx safely, optionally issue a Let's Encrypt certificate, and run the local release.
- Document the security model and operational expectations: Nginx Basic Auth is the external boundary, ACP Web UI remains bound to loopback with app auth disabled by the deployment script, and port `7635` is not exposed directly.

## Capabilities

### New Capabilities
- `nginx-basic-auth-deployment`: Linux Nginx reverse-proxy deployment with Basic Auth, HTTPS integration, and local single-binary release startup.

### Modified Capabilities
- `single-binary-distribution`: Release documentation and scripts describe a reusable Linux reverse-proxy deployment path for the embedded single-binary release.

## Impact

- Affected files: `scripts/`, `README.md`, and OpenSpec deployment documentation/specs.
- Runtime systems: Linux hosts with Nginx, `htpasswd`, optional Certbot, and the existing Rust/Node build toolchain for source builds.
- Network behavior: the ACP Web UI process continues to bind only to loopback for this deployment mode, starts with `--disable-auth`, and Nginx listens on public HTTP/HTTPS ports.
