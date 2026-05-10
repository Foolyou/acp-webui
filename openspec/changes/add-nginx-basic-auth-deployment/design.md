## Context

ACP Web UI already supports a single-binary release with embedded frontend assets and Linux local release startup. The safe public-access deployment shape is to keep the Rust daemon bound to `127.0.0.1` and let Nginx be the only externally reachable process.

Current authentication behavior requires pairing for every browser client unless ACP Web UI authentication is explicitly disabled. Because this deployment is intentionally fronted by Nginx Basic Auth and keeps the daemon bound to loopback, the reusable Nginx deployment starts the loopback-only daemon with `--disable-auth` and makes Nginx Basic Auth the external authentication boundary.

## Goals / Non-Goals

**Goals:**
- Provide a repeatable Linux deployment script for Nginx + Basic Auth + optional Let's Encrypt TLS.
- Reuse the existing local single-binary release script to start ACP Web UI on `127.0.0.1`.
- Generate an Nginx config that supports normal HTTP routes and `/api/ws` WebSocket upgrades.
- Safely validate and reload Nginx without exposing the backend port directly.
- Document prerequisites, security model, rollback, and common variants.

**Non-Goals:**
- Do not add a new backend authentication mode in this change.
- Do not support non-Linux hosts for the Nginx deployment script.
- Do not manage DNS records or firewall provider APIs.
- Do not replace production-grade host hardening, package management policy, or certificate lifecycle tooling outside Certbot.

## Decisions

### Use Nginx as the external authentication boundary

The deployment keeps `acp-webui` on `127.0.0.1:<port>` and configures Nginx to listen on HTTP/HTTPS. Basic Auth is applied at the server level so all frontend routes, API routes, and WebSocket requests require credentials before reaching the upstream.

Alternative considered: require ACP Web UI pairing token in addition to Nginx Basic Auth. That is a useful hardening option, but it makes the first one-command deployment require two independent browser authentication steps. The deployment instead keeps the upstream loopback-only and disables ACP Web UI auth explicitly.

### Generate a reusable config file instead of patching arbitrary Nginx files

The script writes a dedicated config such as `/etc/nginx/conf.d/acp-webui.conf` or a caller-supplied path. This keeps the deployment idempotent and avoids editing distribution-specific default site files.

Alternative considered: use `certbot --nginx` as the main config author. That can mutate host-specific files in surprising ways. The script should own the ACP Web UI config and use Certbot only after a valid HTTP config exists.

### Support both HTTP-only dry deployments and HTTPS issuance

The script should be able to install Nginx config without Certbot for private networks or pre-existing TLS termination. When `--domain` and certificate options are supplied, it can request/activate a Let's Encrypt certificate.

Alternative considered: require HTTPS always. That is safest for internet exposure, but makes local or private testing harder and blocks hosts that already terminate TLS elsewhere.

### Reuse existing release script

The Nginx deployment script should call `scripts/build-run-release.sh --bind-host 127.0.0.1 --bind-port <port> --disable-auth` rather than reimplementing release build and process management.

Alternative considered: duplicate release startup logic inside the Nginx script. That would drift from the existing release path and increase maintenance burden.

## Risks / Trade-offs

- Basic Auth credentials are the only browser authentication layer in this topology → Generate a strong password when one is not supplied, keep ACP Web UI bound to loopback, disable ACP Web UI auth only for the loopback upstream, and document that the backend port must not be exposed directly.
- WebSocket sessions can break behind a basic proxy config → Include `proxy_http_version 1.1`, `Upgrade`, `Connection`, and long proxy timeouts.
- Certbot can fail if DNS or port 80 is not ready → Make certificate issuance optional and validate Nginx config before attempting it.
- Distro Nginx layouts differ → Default to common `/etc/nginx/conf.d` while allowing config path overrides.
- Running as root is required for `/etc/nginx` writes and service reloads → Keep source build and app runtime delegated to the existing project script, and make privileged operations explicit.

## Migration Plan

1. Add OpenSpec requirements for Nginx Basic Auth deployment.
2. Add a reusable Nginx config template.
3. Add a Linux deployment script that renders the template, manages htpasswd, starts the local release, validates Nginx, and reloads it.
4. Update README with the one-command flow and security notes.

Rollback is to remove the generated Nginx config, reload Nginx, and stop the local release process recorded under `.data/release`.

## Open Questions

- Should the deployment script offer an opt-in mode that keeps ACP Web UI pairing active behind Nginx for users who want two browser authentication layers?
- Should the deployment script eventually create a systemd service for persistent boot-time startup instead of using the existing `nohup` release runner?
