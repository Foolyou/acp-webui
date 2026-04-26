## 1. Project Scaffolding

- [x] 1.1 Initialize the Rust backend crate with async runtime, HTTP server, tracing, configuration, and error handling foundations.
- [x] 1.2 Initialize the browser UI project with a mobile-first TypeScript frontend stack.
- [x] 1.3 Add development commands and documentation for running the backend and frontend locally.
- [x] 1.4 Add configuration for bind host, bind port, SQLite database path, and `codex-acp` launch command.

## 2. SQLite Persistence

- [x] 2.1 Add initial SQLite migrations for workspaces, sessions, and messages.
- [x] 2.2 Implement workspace persistence for create, list, and fetch operations.
- [x] 2.3 Implement session persistence for create, fetch, status update, and workspace lookup operations.
- [x] 2.4 Implement message persistence for user prompts and assistant text messages.
- [x] 2.5 Add storage-level tests for workspace, session, and message repositories.

## 3. Codex ACP Runtime

- [x] 3.1 Implement a process launcher for the configured `codex-acp` command with stdin/stdout piping.
- [x] 3.2 Implement ACP initialization and connection status tracking for Codex.
- [x] 3.3 Implement session creation through the ready Codex ACP connection.
- [x] 3.4 Implement prompt submission from a local session to the corresponding ACP session.
- [x] 3.5 Normalize ACP text response updates into session assistant text updates.
- [x] 3.6 Handle unsupported non-text ACP updates without crashing the session runtime.
- [x] 3.7 Mark a session as blocked with a clear unsupported message if a permission request is received.

## 4. Backend API and Realtime Channel

- [x] 4.1 Add an initial app-state endpoint that reports Codex connection status.
- [x] 4.2 Add workspace endpoints for creating and listing local workspaces.
- [x] 4.3 Add session endpoints for creating a session and fetching session detail with persisted messages.
- [x] 4.4 Add a prompt endpoint that accepts non-empty prompts for idle sessions and rejects prompts for running sessions.
- [x] 4.5 Add a WebSocket channel for live Codex connection status and session text updates.
- [x] 4.6 Add reconnect behavior where the browser can reload persisted session history and resume live updates.
- [x] 4.7 Add backend integration tests or smoke tests for the HTTP API using a mock ACP runtime where practical.

## 5. Browser UI

- [x] 5.1 Build the initial mobile-first shell with connection status, workspace selection, and session area.
- [x] 5.2 Build workspace creation UI with local path input and validation error display.
- [x] 5.3 Build session creation UI for an existing workspace.
- [x] 5.4 Build session detail timeline showing user prompts and assistant text messages.
- [x] 5.5 Build prompt composer behavior for idle sessions and disabled/running state while a prompt is active.
- [x] 5.6 Connect the UI to the WebSocket channel for live text updates and connection status changes.
- [x] 5.7 Add reconnect and reload handling that restores persisted session history after page refresh.

## 6. End-to-End Validation

- [x] 6.1 Verify the backend can launch and initialize `codex-acp` in the local development environment.
- [x] 6.2 Verify a user can create a workspace, create a session, send a prompt, and see a Codex text response in the browser.
- [x] 6.3 Verify browser refresh restores the workspace, session, prompt, and assistant response from SQLite.
- [x] 6.4 Verify unsupported non-text ACP updates do not crash the backend.
- [x] 6.5 Document known limitations for the initial version: no approvals, no diff/review, no terminal output, no Markdown preview, and no multi-agent selection.
