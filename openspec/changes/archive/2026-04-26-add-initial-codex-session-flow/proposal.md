## Why

ACP Web UI needs an earliest end-to-end slice that proves the core product loop: a browser can connect to a local daemon, the daemon can connect to Codex through ACP, and a user can create a workspace session, send a prompt, and read a text response.

This should be built before approvals, review, diffs, terminal output, or multi-agent support so the mainline protocol and UI flow can be validated with the smallest useful version.

## What Changes

- Add a Rust local backend that can start or connect to `codex-acp` over stdio and initialize an ACP connection.
- Add workspace creation for a local filesystem path.
- Add session creation within a workspace using the Codex ACP connection.
- Add a browser UI for selecting or creating a workspace, creating a session, sending a text prompt, and displaying streamed or completed text responses.
- Add a minimal browser-to-backend API for workspace, session, prompt submission, and text event delivery.
- Persist enough local state in SQLite to retain workspaces, sessions, prompts, and text messages across backend restarts.
- Defer non-text ACP updates, permission approvals, review/diff views, Markdown previews, terminal output, yolo mode, and additional agents.

## Capabilities

### New Capabilities

- `codex-agent-connection`: Covers launching or connecting to `codex-acp`, initializing ACP communication, and reporting connection status to the web UI.
- `workspace-session-chat`: Covers local workspace creation, session creation, prompt submission, text response display, and minimal durable chat history.

### Modified Capabilities

None.

## Impact

- Adds the initial Rust backend application structure.
- Adds initial browser UI application structure.
- Adds SQLite persistence for the first local data model.
- Adds a browser-to-backend API and realtime text event channel.
- Adds process management and stdio JSON-RPC integration with `codex-acp`.
- Establishes the first implementation path for the product design documented in `doc/0001-product-design.md`.
