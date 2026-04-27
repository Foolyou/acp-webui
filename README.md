# ACP Web UI

Mobile-first local web UI for Agent Client Protocol agents.

This earliest slice connects a Rust local daemon to Codex through `codex-acp`, lets a browser create a local workspace and session, sends text prompts, and displays text responses.

## Current Scope

- Codex only, through `codex-acp`
- Local workspaces
- Session creation
- Sessions list for reopening persisted sessions
- Text prompts and text replies
- Permission approval requests with allow-once and reject-once resolution
- Inbox view for sessions waiting on approval
- Session review artifact cards for ACP tool call evidence
- Full-screen review drill-downs for artifact details and on-demand workspace diffs
- Pairing token access control for non-trusted browsers
- Trusted client IP/CIDR allowlist for deliberate local bypass
- SQLite persistence
- WebSocket live updates

Not included yet: dedicated terminal stream capture, ACP-provided Markdown/diff artifact normalization beyond available tool-call evidence, yolo mode, remembered allow-always/reject-always policies, multi-agent selection.

`allow_always` and `reject_always` ACP options are shown in the browser when an agent provides them, but they are disabled until a deliberate local policy model exists.

## Requirements

- Rust toolchain
- Node.js and npm when building the frontend or building from source
- `codex-acp` available on PATH, or a custom command supplied to the backend
- Codex authentication already configured in the local environment

Release binaries include the ACP Web UI backend, production frontend assets, and SQLite migrations. They still require an ACP agent adapter such as `codex-acp` at runtime.

`codex-acp` can be run directly if installed, or through npm:

```bash
npx @zed-industries/codex-acp
```

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
  --trusted-client 100.64.12.34/32
```

`X-Forwarded-For` and `Forwarded` headers are ignored for trusted-client checks in this version. Do not bind to a broad network interface without either pairing token access or explicit trusted clients.

To use the npm package instead of a binary on PATH:

```bash
cargo run -- \
  --codex-acp-command npx \
  --codex-acp-arg @zed-industries/codex-acp
```

The backend serves API endpoints under `/api/*`. Development builds serve the production frontend from `frontend/dist` when it exists. During frontend development, use the Vite dev server and point it at the backend API.

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

## Browser E2E

The browser E2E suite uses Playwright with a fake ACP process so it can validate the UI, backend, WebSocket, and SQLite restore flow without making a real Codex call.

Install Playwright Chromium inside WSL:

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
It also exercises a fake permission request, verifies the mobile approval sheet, confirms always options are disabled, and approves the request with an allow-once option.
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
- `GET /api/sessions/:session_id/review-artifacts`
- `GET /api/sessions/:session_id/review-artifacts/:artifact_id`
- `GET /api/sessions/:session_id/review-diff`
- `POST /api/sessions/:session_id/prompt`
- `POST /api/sessions/:session_id/cancel`
- `POST /api/permission-requests/:permission_id/resolve`
- `GET /api/ws`
