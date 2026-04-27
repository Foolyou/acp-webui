## 1. Runtime Configuration

- [x] 1.1 Add `--work-dir` and `ACP_WEBUI_WORK_DIR` configuration.
- [x] 1.2 Resolve the default work directory to a hidden directory under the user's home directory.
- [x] 1.3 Create the resolved work directory during startup before opening storage.
- [x] 1.4 Change database configuration so the default SQLite URL is derived from `<work-dir>/acp-webui.db`.
- [x] 1.5 Preserve explicit `--database-url` and `ACP_WEBUI_DATABASE_URL` precedence over work-directory-derived database URLs.
- [x] 1.6 Add unit tests for default work directory resolution, CLI/env work directory override, current-directory independence, unwritable work directory failure, and database URL precedence.

## 2. Embedded Frontend Serving

- [x] 2.1 Add an embedded frontend build feature and asset embedding dependency or module.
- [x] 2.2 Refactor frontend serving behind a small abstraction that supports embedded assets and disk assets.
- [x] 2.3 Serve embedded frontend assets for release builds when no explicit frontend directory is configured.
- [x] 2.4 Preserve disk frontend serving for non-embedded builds and explicit `--frontend-dist` overrides.
- [x] 2.5 Implement SPA fallback for embedded assets while keeping `/api/*` requests routed to API handlers.
- [x] 2.6 Set appropriate content types for embedded HTML, JavaScript, CSS, and common static assets.
- [x] 2.7 Add backend tests or smoke tests for embedded index serving, embedded asset serving, SPA fallback, API route separation, and disk override behavior.

## 3. Build and Release Workflow

- [x] 3.1 Add documented release commands that build the frontend before building Rust with the embedded frontend feature.
- [x] 3.2 Ensure missing frontend assets produce a clear build or startup error for embedded release builds.
- [x] 3.3 Add a release smoke test that starts the binary from a directory without `frontend/dist` and verifies the frontend loads.

## 4. Documentation

- [x] 4.1 Update README run instructions to describe the single-binary release artifact.
- [x] 4.2 Document the default `~/.acp-webui` work directory and `--work-dir` / `ACP_WEBUI_WORK_DIR` overrides.
- [x] 4.3 Document the new default database location and how to keep using an old `.data/acp-webui.db` with `--database-url`.
- [x] 4.4 Clarify that the binary includes ACP Web UI backend, production frontend assets, and SQLite migrations, but still requires `codex-acp` or another configured ACP adapter externally.

## 5. Validation

- [x] 5.1 Run OpenSpec validation for `package-single-binary-distribution`.
- [x] 5.2 Run backend tests.
- [x] 5.3 Run frontend build.
- [x] 5.4 Run the embedded release smoke test.
