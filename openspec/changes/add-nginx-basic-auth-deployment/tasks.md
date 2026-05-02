## 1. Deployment Assets

- [ ] 1.1 Add a reusable Nginx Basic Auth reverse-proxy template for ACP Web UI.
- [ ] 1.2 Add a Linux one-command Nginx deployment script that renders the template, manages htpasswd, starts the loopback release, validates Nginx, reloads Nginx, and optionally runs Certbot.

## 2. Documentation

- [ ] 2.1 Document the Linux Nginx Basic Auth deployment flow, prerequisites, security model, and common variants in README.

## 3. Verification

- [ ] 3.1 Validate shell syntax and template rendering paths without requiring privileged host changes.
- [ ] 3.2 Run OpenSpec validation for the change.
