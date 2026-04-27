## Why

ACP Web UI should be easy to run from a release artifact without requiring users to keep a built frontend directory beside the backend binary. It also needs a stable default location for runtime state so launching the binary from different shell directories does not scatter SQLite data or future app files.

## What Changes

- Add a single-binary distribution mode where the production React/Vite frontend is embedded into the Rust executable and served without `frontend/dist` at runtime.
- Keep development workflows intact by continuing to support the Vite dev server and disk-based frontend serving where useful.
- Add an application work directory setting with a safe per-user default such as `~/.acp-webui`.
- Store the default SQLite database under the application work directory instead of the process current directory.
- Add CLI and environment configuration so users can choose a different application work directory.
- Keep `codex-acp` as an external runtime dependency in this change; the release binary packages ACP Web UI itself, not third-party agent adapters or Codex credentials.
- Update release, setup, and run documentation to explain the single-binary artifact, default data location, work directory override, and remaining external dependencies.

## Capabilities

### New Capabilities

- `single-binary-distribution`: Defines standalone ACP Web UI binary behavior, embedded frontend serving, application work directory defaults, and user overrides for local runtime state.

### Modified Capabilities

- None.

## Impact

- Backend configuration changes to add application work directory resolution and to derive the default database URL from that directory.
- Backend static frontend serving changes to support embedded assets while preserving development disk serving.
- Build/release workflow changes to build the frontend before embedding assets into release binaries.
- Tests need coverage for embedded frontend fallback, default work directory resolution, work directory override, and database URL precedence.
- Documentation must clarify that the binary includes ACP Web UI assets and migrations but still requires an ACP agent adapter such as `codex-acp` on PATH or supplied through command arguments.
