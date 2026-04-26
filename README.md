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
- SQLite persistence
- WebSocket live updates

Not included yet: dedicated terminal stream capture, ACP-provided Markdown/diff artifact normalization beyond available tool-call evidence, yolo mode, remembered allow-always/reject-always policies, multi-agent selection.

`allow_always` and `reject_always` ACP options are shown in the browser when an agent provides them, but they are disabled until a deliberate local policy model exists.

## Requirements

- Rust toolchain
- Node.js and npm
- `codex-acp` available on PATH, or a custom command supplied to the backend
- Codex authentication already configured in the local environment

`codex-acp` can be run directly if installed, or through npm:

```bash
npx @zed-industries/codex-acp
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
  --database-url sqlite://.data/acp-webui.db \
  --codex-acp-command codex-acp
```

To use the npm package instead of a binary on PATH:

```bash
cargo run -- \
  --codex-acp-command npx \
  --codex-acp-arg @zed-industries/codex-acp
```

The backend serves API endpoints under `/api/*` and the production frontend from `frontend/dist` when it exists. During frontend development, use the Vite dev server and point it at the backend API.

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
