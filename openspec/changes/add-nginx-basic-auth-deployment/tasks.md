## 1. Deployment Assets

- [x] 1.1 Add a reusable Nginx Basic Auth reverse-proxy template for ACP Web UI.
- [x] 1.2 Add a Linux one-command Nginx deployment script that renders the template, manages htpasswd, starts the loopback release, validates Nginx, reloads Nginx, and optionally runs Certbot.

## 2. Documentation

- [x] 2.1 Document the Linux Nginx Basic Auth deployment flow, prerequisites, security model, and common variants in README.

## 3. Verification

- [x] 3.1 Validate shell syntax and template rendering paths without requiring privileged host changes.
- [x] 3.2 Run OpenSpec validation for the change.
