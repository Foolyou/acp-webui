## ADDED Requirements

### Requirement: Release binary serves embedded frontend
ACP Web UI SHALL support a release build mode where the production frontend assets are embedded in the backend executable and served without requiring a runtime `frontend/dist` directory.

#### Scenario: Embedded frontend works without frontend directory
- **WHEN** the daemon is built with embedded frontend assets and starts in a directory that does not contain `frontend/dist`
- **THEN** requesting `/` returns the production frontend HTML
- **AND** referenced frontend JavaScript and CSS assets are served by the daemon

#### Scenario: SPA routes fall back to embedded index
- **WHEN** the daemon is built with embedded frontend assets
- **AND** a browser requests a non-API route such as `/sessions/example`
- **THEN** the daemon returns the embedded frontend index HTML

#### Scenario: API routes are not handled as frontend assets
- **WHEN** the daemon is built with embedded frontend assets
- **AND** a client requests an `/api/*` route
- **THEN** the request is routed through the API router instead of the frontend fallback

### Requirement: Development frontend serving remains available
ACP Web UI SHALL preserve disk-based frontend serving for development and explicit local overrides.

#### Scenario: Non-embedded build serves disk frontend
- **WHEN** the daemon is built without embedded frontend assets
- **AND** a frontend distribution directory is configured or available at the development default path
- **THEN** the daemon serves the production frontend from that directory

#### Scenario: Explicit frontend directory overrides embedded assets
- **WHEN** the daemon is built with embedded frontend assets
- **AND** the user supplies a frontend distribution directory through configuration
- **THEN** the daemon serves frontend assets from the configured directory
- **AND** the embedded assets remain available as the default when no frontend directory is supplied

### Requirement: Default work directory is stable
ACP Web UI SHALL resolve a default application work directory under the current user's home directory and SHALL NOT use the process current directory for default runtime state.

#### Scenario: Default work directory is under user home
- **WHEN** the daemon starts without an explicit work directory
- **THEN** it resolves the application work directory to a hidden directory under the user's home directory such as `~/.acp-webui`
- **AND** it creates the directory if it does not already exist

#### Scenario: Default database path is independent of launch directory
- **WHEN** the daemon starts from two different process current directories without explicit work directory or database URL configuration
- **THEN** both runs resolve the same default SQLite database path under the application work directory

### Requirement: Work directory is configurable
ACP Web UI SHALL allow users to override the application work directory through CLI and environment configuration.

#### Scenario: CLI work directory override
- **WHEN** the user starts the daemon with `--work-dir <path>`
- **THEN** the daemon uses `<path>` as the application work directory
- **AND** it creates `<path>` if it does not already exist

#### Scenario: Environment work directory override
- **WHEN** the user starts the daemon with `ACP_WEBUI_WORK_DIR` set
- **AND** no CLI work directory is supplied
- **THEN** the daemon uses the environment value as the application work directory

#### Scenario: Unwritable work directory fails before serving
- **WHEN** the resolved application work directory cannot be created or written
- **THEN** daemon startup fails with a clear error
- **AND** the HTTP server is not bound

### Requirement: Database URL derives from work directory by default
ACP Web UI SHALL derive its default SQLite database URL from the resolved application work directory unless an explicit database URL is configured.

#### Scenario: Default database is inside work directory
- **WHEN** the daemon starts without explicit database URL configuration
- **THEN** it uses a SQLite database URL pointing at `acp-webui.db` inside the resolved application work directory

#### Scenario: Work directory override changes default database path
- **WHEN** the user supplies `--work-dir <path>`
- **AND** no explicit database URL is supplied
- **THEN** the daemon uses a SQLite database URL pointing at `<path>/acp-webui.db`

#### Scenario: Explicit database URL takes precedence
- **WHEN** the user supplies `--database-url <url>` or `ACP_WEBUI_DATABASE_URL`
- **THEN** the daemon uses the supplied database URL
- **AND** it does not replace that value with a database URL derived from the work directory

### Requirement: Release documentation describes packaged and external dependencies
ACP Web UI documentation SHALL explain the standalone binary behavior, default work directory, work directory override, and remaining external ACP adapter dependency.

#### Scenario: User can identify runtime state location
- **WHEN** a user reads the run or release documentation
- **THEN** the documentation identifies the default application work directory and the command-line option for overriding it

#### Scenario: User can identify what the binary includes
- **WHEN** a user reads the run or release documentation
- **THEN** the documentation states that the ACP Web UI binary includes the backend, production frontend assets, and SQLite migrations
- **AND** it states that `codex-acp` or another configured ACP adapter remains an external runtime dependency
