# ACP Web UI

Mobile-first local web UI for Agent Client Protocol agents.

This slice connects a Rust local daemon to ACP agents over stdio. Users can create Codex or Claude sessions inside the same local workspace, send text prompts, approve permission requests, restore eligible persisted sessions, and review session evidence.

## Current Scope

- Codex through `codex-acp`
- Optional Claude support through `@agentclientprotocol/claude-agent-acp`
- Local workspaces
- Session creation with per-agent launch controls, including permission mode compatibility
- Sessions list for reopening persisted sessions
- ACP-first session continuation through verified `session/load` support when the connected agent advertises it
- Text prompts and text replies
- Permission approval requests with agent-provided resolution options, including always options when the agent advertises them
- Inbox view for sessions waiting on approval
- Session review artifact cards for ACP tool call evidence
- Full-screen review drill-downs for artifact details and on-demand workspace diffs
- Pairing token access control for non-trusted browsers
- Trusted client IP/CIDR allowlist for deliberate local bypass
- SQLite persistence
- Per-agent runtime status, launch profile status, and WebSocket live updates
- Prompt composer `$skill` autocomplete from discovered local Codex skills

Not included yet: dedicated terminal stream capture, ACP-provided Markdown/diff artifact normalization beyond available tool-call evidence, remembered local allow/reject policy rules, arbitrary custom-agent settings UI, private agent transcript parsing, in-app Claude authentication, or durable restoration of in-flight approval responders after backend restart.

Persisted sessions remain reviewable after browser refresh or backend restart. Prompt submission is enabled only when the backend has live ACP runtime context or the user successfully restores an eligible session through a verified agent capability. ACP Web UI currently implements `session/load`; `session/resume` is detected as a separate agent capability but is not enabled as a continuation path in this version.

Agent controls are split into two scopes. Launch controls are provider-adapter fallbacks that affect the ACP runtime process used for a new session, so they are persisted as a display-safe launch profile snapshot and cannot be changed after the session is created. ACP session controls come from the agent's `configOptions` and can be changed from the composer while a session is idle and live.

Codex sessions can be created in `manual`, `full_auto`, or `yolo` permission modes. `manual` preserves the approval-managed ACP flow, `full_auto` uses sandboxed automatic execution, and `yolo` bypasses approvals and sandboxing for that session. Codex also exposes launch-time reasoning and fast response controls as adapter fallbacks when ACP does not advertise equivalent session controls. Claude currently exposes only verified manual launch behavior until adapter-specific effort or speed mappings are confirmed. OpenCode is represented as a disabled provider definition by default; enable it with an ACP command once an adapter is available.

`allow_always` and `reject_always` ACP options are shown and selectable when an agent provides them. ACP Web UI forwards the selected option id to the agent; it does not add its own remembered local policy engine.

## Requirements

- Rust toolchain
- Node.js and npm when building the frontend or building from source
- `uv` for the Python-backed fake ACP E2E fixture and cross-device Python setup
- `codex-acp` available on PATH, or a custom Codex command supplied to the backend
- Node.js/npm available at runtime when enabling Claude through the default `npx` command
- Codex and/or Claude authentication already configured in the local environment used to launch the backend

Release binaries include the ACP Web UI backend, production frontend assets, and SQLite migrations. They still require ACP agent adapters such as `codex-acp` or `@agentclientprotocol/claude-agent-acp` at runtime.

`codex-acp` can be run directly if installed, or through npm:

```bash
npx @zed-industries/codex-acp
```

Codex and Claude appear as session choices by default. Their ACP runtimes start lazily when the user creates a session with that agent, so Claude does not need to be launched at backend startup. The default Claude command launches this on first use:

```bash
npx --yes @agentclientprotocol/claude-agent-acp
```

Override the Claude adapter command or args when needed:

```bash
acp-webui \
  --claude-acp-command npx \
  --claude-acp-arg --yes \
  --claude-acp-arg @agentclientprotocol/claude-agent-acp
```

Claude login is not handled in the browser. If the adapter reports a missing authentication or configuration prerequisite, ACP Web UI shows that failure on the Claude agent while idle or ready Codex sessions remain usable.

## Runtime State

By default, ACP Web UI stores runtime state under:

```text
~/.acp-webui
```

The default SQLite database is:

```text
~/.acp-webui/acp-webui.db
```

Use `--work-dir` or `ACP_WEBUI_WORK_DIR` to place ACP Web UI state somewhere else:

```bash
acp-webui --work-dir /path/to/acp-webui-state
```

Advanced users can still override the database URL directly. An explicit database URL takes precedence over the work directory:

```bash
acp-webui --database-url sqlite://.data/acp-webui.db
```

## Development

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the frontend dev server:

```bash
cd frontend
npm run dev
```

Run the backend:

```bash
cargo run -- \
  --bind-host 127.0.0.1 \
  --bind-port 7635 \
  --codex-acp-command codex-acp
```

Claude is listed in the browser without an extra startup flag and starts when the user creates a Claude session.

The backend protects `/api/*` and `/api/ws` with pairing-token access control. Loopback clients (`127.0.0.1` and `::1`) are trusted by default for local development. Other client IPs must pair with the token shown in the backend terminal unless they are explicitly trusted.

To use a stable pairing token:

```bash
cargo run -- \
  --pairing-token your-local-token
```

To trust a specific device or network range, pass explicit trusted clients. Prefer a single IP or `/32` for mobile devices:

```bash
cargo run -- \
  --bind-host 0.0.0.0 \
  --trusted-client <trusted-client-cidr>
```

`X-Forwarded-For` and `Forwarded` headers are ignored for trusted-client checks in this version. Do not bind to a broad network interface without either pairing token access or explicit trusted clients.

To use the npm package instead of a binary on PATH:

```bash
cargo run -- \
  --codex-acp-command npx \
  --codex-acp-arg @zed-industries/codex-acp
```

On Linux, start or restart both development servers on loopback:

```bash
./scripts/run-linux-dev.sh
```

Useful variants:

```bash
./scripts/run-linux-dev.sh --install-frontend-deps
./scripts/run-linux-dev.sh --no-run
./scripts/run-linux-dev.sh --tailscale
./scripts/run-linux-dev.sh --tailscale-ip 100.x.y.z --trusted-client <trusted-client-cidr>
```

The backend serves API endpoints under `/api/*`. Development builds serve the production frontend from `frontend/dist` when it exists. During frontend development, use the Vite dev server and point it at the backend API.

To run both development servers on your local Tailscale IPv4 address with Vite hot reload:

```powershell
.\scripts\run-tailscale-dev.ps1
```

The script restarts any listeners on the configured dev ports, then starts the backend on `http://<tailscale-ip>:7635` and the Vite frontend on `http://<tailscale-ip>:5777`. Vite proxies `/api` and `/api/ws` to the backend through `ACP_WEBUI_BACKEND_URL`.

Useful variants:

```powershell
.\scripts\run-tailscale-dev.ps1 -TrustedClients <trusted-client-cidr>
.\scripts\run-tailscale-dev.ps1 -PairingToken your-local-token
.\scripts\run-tailscale-dev.ps1 -InstallFrontendDeps
```

## Single-Binary Release Build

Build the frontend first, then build the Rust binary with embedded frontend assets:

```bash
cd frontend
npm run build
cd ..
cargo build --release --features embedded-frontend
```

The resulting binary at `target/release/acp-webui` or `target/release/acp-webui.exe` serves the frontend without a runtime `frontend/dist` directory.

On Windows, run the embedded frontend smoke test:

```powershell
.\scripts\smoke-embedded-frontend.ps1
```

The smoke test builds the frontend and release binary, starts the binary from a temporary directory that does not contain `frontend/dist`, and verifies that `/`, an embedded asset, and an SPA route load successfully.

To stop current local project services, build the embedded release binary, and run it on this machine:

```powershell
.\scripts\build-run-release.ps1
```

The script stops listeners on the local project backend and Vite dev ports, stops release binaries running from this repository, builds the frontend and embedded release binary, then starts the release binary in the background. By default it binds to `127.0.0.1:7635`.

To bind only to the local Tailscale IPv4 address:

```powershell
.\scripts\build-run-release.ps1 -BindTailscale
```

In Tailscale mode (`-BindTailscale`, or the shorter `-Tailscale` alias) the script detects the local `100.64.0.0/10` address, refuses non-Tailscale bind addresses, and starts the server with `--bind-host <tailscale-ip>`. Pairing-token auth remains enabled by default; Tailscale ACLs still control which tailnet peers can reach the node.

To publish the local release through Tailscale Serve:

```powershell
.\scripts\build-run-release.ps1 -TailscaleServe
```

Tailscale Serve mode binds the release server to `127.0.0.1`, starts it in the background, clears any foreground `tailscale serve` process created by a previous manual command, and configures a persistent `tailscale serve --bg` proxy to the loopback server. Use this mode for the `https://<machine>.<tailnet>.ts.net/` URL shown by `tailscale serve status`.

Useful variants:

```powershell
.\scripts\build-run-release.ps1 -SkipBuild
.\scripts\build-run-release.ps1 -TailscaleServe -SkipBuild
.\scripts\build-run-release.ps1 -TailscaleIp 100.x.y.z
.\scripts\build-run-release.ps1 -BindTailscale -TrustedClients <trusted-client-cidr>
.\scripts\build-run-release.ps1 -NoRun
```

To build, copy, and restart the embedded release binary on a remote Windows
machine through PowerShell remoting:

```powershell
.\scripts\deploy-windows.ps1 `
  -ComputerName <host> `
  -BindTailscale `
  -TrustedClients <trusted-client-cidr>
```

The deployment script copies only `acp-webui.exe`, writes a small remote launcher,
and starts it through a scheduled task named `ACP Web UI`. It stops the previous
deployment or any listener on the selected bind port before replacing the binary.
Pass `-NoStopExisting` if you want it to fail instead of closing an occupied
port.
With `-BindTailscale`, the script resolves the remote machine's Tailscale IPv4
address, passes it as `--bind-host`, and verifies that the selected port is not
listening on any non-Tailscale address. Pass `-TailscaleIp 100.x.y.z` to require
a specific remote Tailscale address.
By default it deploys under the remote machine's `%ProgramData%\acp-webui`; pass
`-RemoteDir <remote-dir>` to choose a different location.
The remote machine still needs runtime ACP adapter commands such as `codex-acp`
or `npx` on PATH.
When `-ComputerName` looks like an SSH target such as `<user>@<host>`, the script
uses `ssh` and `scp` automatically; pass `-UseSsh` or `-SshTarget <user>@<host>`
to force SSH transport.

Useful variants:

```powershell
.\scripts\deploy-windows.ps1 -ComputerName <host> -SkipBuild
.\scripts\deploy-windows.ps1 -ComputerName <host> -NoRun
.\scripts\deploy-windows.ps1 -ComputerName <user>@<host> -BindTailscale
.\scripts\deploy-windows.ps1 -ComputerName <host> -BindTailscale -PairingToken <token>
.\scripts\deploy-windows.ps1 -ComputerName <host> -TailscaleIp 100.x.y.z -TrustedClients <trusted-client-cidr>
```

## Browser E2E

The browser E2E suite uses Playwright with a fake ACP process so it can validate the UI, backend, WebSocket, and SQLite restore flow without making a real Codex call.
The fake ACP fixture is started through `uv run --script`, so clean machines do not need a separately installed system Python as long as `uv` is available.

Install the pinned Python runtime for the fake ACP fixture:

```bash
uv python install
```

Install Playwright Chromium:

```bash
cd frontend
npm run e2e:install
```

On Linux or WSL machines that also need Playwright's OS packages, use:

```bash
cd frontend
sudo npx playwright install --with-deps chromium
```

Build the backend binary and frontend bundle before running E2E:

```bash
cargo build
cd frontend
npm run build
npm run e2e
```

The E2E test starts `target/debug/acp-webui` on `127.0.0.1:7638`, creates a workspace and session, sends a prompt through the browser, receives a fake assistant text reply, refreshes the page, and verifies the persisted timeline is restored.
Set `ACP_WEBUI_E2E_BINARY` to point the suite at an alternate debug binary when `target/debug/acp-webui` is already running or locked by another process.
It also exercises manual and YOLO permission-mode session creation, a fake permission request, the mobile approval sheet, selectable always options, and approval with an allow-once option.
The suite covers backend restart followed by ACP `session/load` restoration, restore failure messaging, and view-only fallback states.
The suite also exercises a fake ACP tool call review artifact, opens its session-scoped drill-down, and verifies that Review is not exposed as a first-level navigation item.

## Useful Endpoints

- `GET /api/app-state`
- `GET /api/auth/status`
- `POST /api/auth/pair`
- `GET /api/inbox`
- `GET /api/sessions`
- `GET /api/workspaces`
- `POST /api/workspaces`
- `POST /api/workspaces/:workspace_id/sessions`
- `GET /api/sessions/:session_id`
- `POST /api/sessions/:session_id/restore`
- `GET /api/sessions/:session_id/review-artifacts`
- `GET /api/sessions/:session_id/review-artifacts/:artifact_id`
- `GET /api/sessions/:session_id/review-diff`
- `POST /api/sessions/:session_id/prompt`
- `POST /api/sessions/:session_id/cancel`
- `POST /api/permission-requests/:permission_id/resolve`
- `GET /api/ws`
