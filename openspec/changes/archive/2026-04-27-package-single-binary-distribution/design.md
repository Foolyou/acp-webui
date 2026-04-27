## Context

ACP Web UI is currently split between a Rust local daemon and a React/Vite frontend. The daemon serves production assets from `frontend/dist` at runtime, so a release binary alone is not enough to open the app. SQLite migrations are already embedded at compile time through `sqlx::migrate!`, but the default database URL points at `.data/acp-webui.db`, which is relative to the process current directory.

That current-directory default is convenient inside the repository but poor for a distributed local daemon. Running the same binary from a download folder, a shell script, or a different terminal working directory can create separate databases and make existing session history appear to disappear.

The product remains local-first and single-user. The first distribution improvement should package ACP Web UI itself and stabilize runtime state locations without trying to bundle external ACP adapters such as `codex-acp`.

## Goals / Non-Goals

**Goals:**

- Produce release binaries that can serve the production frontend without a sibling `frontend/dist` directory.
- Preserve development workflows that use Vite or disk-based frontend bundles.
- Resolve a stable application work directory under the user's home directory by default.
- Let users override the application work directory from CLI or environment configuration.
- Derive the default SQLite database URL from the application work directory.
- Keep an explicit database URL override for advanced users and tests.
- Document what is included in the binary and what remains an external dependency.

**Non-Goals:**

- Bundling `codex-acp`, `npx`, Node.js, Codex authentication, or any other third-party agent adapter into the ACP Web UI binary.
- Replacing SQLite persistence.
- Adding an installer, service manager, auto-updater, or platform package manager integration.
- Moving existing `.data/acp-webui.db` files automatically.
- Changing browser authentication, pairing token behavior, or network binding semantics.

## Decisions

### Embed frontend assets for release builds

Release builds will compile `frontend/dist` into the Rust binary behind an explicit feature such as `embedded-frontend`. The release pipeline will build the frontend first, then build Rust with the embedding feature enabled.

Rationale:

- The resulting release artifact is one executable file for ACP Web UI.
- The frontend remains a normal Vite app and keeps its current relative API/WebSocket assumptions.
- Static asset lookup stays in the Rust daemon, where API routing and SPA fallback already live.

Alternatives considered:

- Run `npm` from `build.rs`: rejected because normal Cargo builds would become dependent on Node.js, npm state, and network/package cache behavior.
- Extract embedded assets to a temporary directory at startup: rejected because it adds temporary-file lifecycle and cleanup issues without meaningful benefit.
- Switch to a desktop shell such as Tauri or Electron: rejected because ACP Web UI is intended to be opened from normal mobile browsers.

### Keep disk frontend serving as a development and override path

The existing disk-serving path should remain available. In non-embedded builds, the daemon can continue to serve a configured frontend distribution directory. In embedded builds, an explicitly provided frontend distribution path can still override embedded assets for debugging or local experiments.

Rationale:

- Frontend development keeps using Vite and does not require rebuilding Rust for every UI change.
- Backend-only development can still point at a local `frontend/dist`.
- Debugging a release binary against alternate static assets remains possible.

Implementation implication:

- `--frontend-dist` should become an optional override rather than the only way to serve production frontend assets.
- When no explicit frontend directory is provided, embedded builds use embedded assets and non-embedded builds fall back to the repository-style `frontend/dist` path.

### Add an application work directory

The daemon will add `--work-dir` and `ACP_WEBUI_WORK_DIR`. If neither is provided, it resolves a default under the user's home directory, such as `~/.acp-webui`.

The daemon will create the work directory on startup. The default database URL will become `sqlite://<work-dir>/acp-webui.db`.

Rationale:

- Runtime state no longer depends on the shell current directory.
- A single hidden directory is easy to inspect, back up, remove, or override.
- The same concept can later hold app settings, logs, raw ACP event storage, or retention-managed artifacts.

Alternatives considered:

- Platform-specific app data directories: reasonable later, but the user explicitly prefers a hidden folder under the user directory for this proposal.
- Keeping `.data` as the default: rejected because it is relative and surprises users outside repository development.
- Requiring `--database-url` for releases: rejected because the default path should work out of the box.

### Preserve explicit database URL precedence

`--database-url` and `ACP_WEBUI_DATABASE_URL` remain supported. When either is supplied explicitly, that value is used instead of deriving a database URL from the work directory.

Rationale:

- Existing tests and advanced local setups can keep in-memory or custom database URLs.
- Users with existing `.data/acp-webui.db` files can opt into the old path during transition.
- Work directory configuration should not make lower-level storage configuration impossible.

Implementation implication:

- The config layer must be able to distinguish an explicit database URL from the absence of one. The current hard-coded Clap default for `database_url` should be replaced with derived configuration after argument parsing.

### Do not automatically migrate old current-directory databases

This change will not move or copy `.data/acp-webui.db` automatically. Documentation should explain the new default location and how to continue using or manually copy an existing database.

Rationale:

- The old path is relative to an arbitrary current directory, so automatic discovery can choose the wrong file.
- Silent copies can create confusing divergence between old and new databases.
- This project is still early enough that a documented transition is acceptable.

## Risks / Trade-offs

- [Risk] Embedded builds can accidentally package stale frontend assets. -> Mitigation: make release commands build the frontend first and validate the embedded build with an HTTP smoke test.
- [Risk] Building with embedded assets fails when `frontend/dist` is missing. -> Mitigation: provide a clear build error and document the required build order.
- [Risk] Existing users may not see old sessions after the default database path changes. -> Mitigation: document the new path, the old override, and manual copy guidance.
- [Risk] `~/.acp-webui` is less native than platform-specific app data directories on Windows and macOS. -> Mitigation: accept this explicit first version choice and keep `--work-dir` available.
- [Risk] A user-supplied work directory may not be writable. -> Mitigation: fail startup with a clear error before binding the server.

## Migration Plan

1. Add work directory configuration and derived database URL resolution.
2. Add embedded frontend serving behind a release feature while preserving disk serving.
3. Add build/release documentation and smoke-test instructions.
4. Update tests to cover config precedence and embedded/disk static serving behavior.

Rollback during development is straightforward: build without the embedding feature and pass `--database-url sqlite://.data/acp-webui.db` if the old database location is needed.

## Open Questions

- Should the default hidden directory name remain `~/.acp-webui`, or should the final implementation prefer a configurable constant such as `~/.config/acp-webui` before this change is implemented?
- Should release automation live in a small script, GitHub Actions workflow, or both?
