# Repository Guidelines

## Commit Messages

- Use concise imperative sentence case.
- Do not add a trailing period.
- Keep the subject focused on one change.
- Provide a concise commit title, and include a richer commit body when the rationale, scope, or follow-up context is useful.
- Prefix bug fix commits with `fix:`.
- Prefix internal specification and OpenSpec changes with `spec:`.
- Prefix external user-facing documentation changes with `doc:`.
- Use a clear conventional prefix for other categories, such as `feat:`, `refactor:`, `test:`, `chore:`, or `style:`.
- Prefer wording consistent with recent history, for example:
  - `feat: implement initial Codex session flow`
  - `spec: propose permission approval flow`
  - `fix: reuse existing workspaces`
  - `doc: update public setup guide`

## Commit Scope

- Keep implementation, product documentation, and repository guidance in separate commits when they are separate concerns.
- When finalizing an implemented OpenSpec change, amend the related spec sync and archive movement into the implementation commit.
- Commit product design updates separately from application code.
- Commit repository workflow or agent guidance updates separately.

## OpenSpec Commit Discipline

- Hard rule: after proposing a change, applying a change, or archiving a change, immediately create a git commit for the related modifications before moving on to other work.
- Keep those commits scoped to the OpenSpec operation and its directly related implementation or spec updates.
- Do not leave completed OpenSpec propose, apply, or archive work uncommitted.

## Development Servers

- Run the frontend dev server on port `5777`.
- Release single-binary runs must use backend port `7635`. If `7635` is occupied, stop the occupying project service/process and retry the same port. If the port is still not released after three retries, stop and notify the user; do not switch to another port on your own.
- Hard rule: never bind project services to `0.0.0.0`, `::`, `[::]`, `*`, or any equivalent all-interface address. Bind only to `127.0.0.1` for local-only access or to the machine's explicit Tailscale IP for tailnet access.

## Hardcoded Paths

- Hard rule: never commit user-specific hardcoded paths, usernames, home directories, workspace names, local IP addresses, secrets, or machine-specific absolute paths anywhere in code, tests, scripts, specs, docs, or repository guidance.
- Use configuration, environment variables, CLI arguments, temporary directories, fixtures, or neutral placeholders instead.
- Keep examples generic, such as `<project-path>` or `custom-state`; do not use real home-directory paths or workspace paths copied from a developer machine.

## Private Local and Network Information

- Hard rule: never commit real local machine information, Tailscale information, or developer personal identifiers anywhere in code, tests, scripts, specs, docs, repository guidance, or generated artifacts.
- Treat the following as sensitive even in tests and examples: local or LAN IP addresses, Tailscale IPs, MagicDNS names, tailnet names, hostnames, device names, usernames, email addresses, home-directory paths, workspace paths, cookies, pairing tokens, logs, screenshots, database files, and command output copied from a developer machine.
- Use neutral placeholders and reserved example values instead, such as `127.0.0.1` for loopback-only examples, `192.0.2.10` for documentation-only IP examples, `acp-webui.tailnet.test` for Tailscale-style host examples, `<user>`, `<host>`, `<tailnet-name>`, and `<project-path>`.
- Before committing, search staged changes for local paths, real IPs, Tailscale domains, usernames, email addresses, tokens, logs, screenshots, and database artifacts. If any were committed or pushed, stop and ask before rewriting history or force-pushing.
