## Context

The repository is currently at the product-design stage. `doc/0001-product-design.md` establishes ACP Web UI as a local-first mobile cockpit where a Rust backend acts as a headless ACP client and a browser UI provides the user interaction surface.

This change creates the smallest useful end-to-end implementation: connect to Codex through `codex-acp`, create a local workspace and session, send a text prompt, and display text responses in the browser.

The first version deliberately ignores non-text ACP updates. Permission requests, tool call cards, diffs, Markdown preview, terminal output, yolo mode, and multi-agent support remain out of scope.

## Goals / Non-Goals

**Goals:**

- Establish the initial Rust backend application with HTTP and WebSocket endpoints.
- Launch or connect to `codex-acp` through stdio and initialize ACP communication.
- Let the user create a local workspace from a filesystem path.
- Let the user create a session for that workspace.
- Let the user submit a text prompt to Codex.
- Stream or deliver text response updates to the browser.
- Persist workspaces, sessions, user prompts, and agent text messages in SQLite.
- Provide a minimal mobile-first browser UI for the mainline flow.

**Non-Goals:**

- No approval UI or permission request handling beyond safely surfacing an unsupported state if encountered.
- No diff, Review page, Markdown preview, terminal output display, or artifact handling.
- No multi-agent selection beyond the built-in Codex path.
- No prompt queueing while a turn is running.
- No team collaboration, remote account system, or cloud sync.
- No production-grade authentication beyond the minimal local access shape needed for this slice.

## Decisions

### Use Rust backend as the first executable surface

The backend owns ACP communication, child process lifecycle, persistence, and browser-facing APIs. Rust fits the local daemon role because this slice immediately needs process management, async stdio, WebSocket fanout, and durable local state.

Alternative considered: start with a frontend-only mock. That would be faster visually but would not validate the main risk: whether the daemon can drive `codex-acp` through ACP and return usable text updates.

### Use `codex-acp` as the only initial agent adapter

Codex is the first supported agent, and `codex-acp` is the adapter path. The implementation should still name concepts generically where cheap: agent process, ACP connection, workspace, session, prompt turn, and text event.

Alternative considered: build a generalized multi-agent registry immediately. That adds configuration and capability branching before the first Codex path is proven.

### Treat browser state as a projection of backend state

The browser should not be the source of truth for sessions or messages. It requests actions and receives current state plus text events from the backend.

This keeps reconnect behavior simple: the browser can reload session history from SQLite and then resume receiving live events.

Alternative considered: keep all early history in frontend memory. That would make the first UI faster to build but would fight the product's local-first durable-session direction.

### Use SQLite from the first slice

SQLite should store workspaces, sessions, and messages from the beginning. This validates persistence assumptions early and avoids rebuilding the interaction flow when durable history is added.

The minimal schema can be small:

- `workspaces`: id, name, path, created_at
- `sessions`: id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at
- `messages`: id, session_id, role, content, status, created_at

Additional raw ACP event storage can be introduced later when non-text updates are supported.

Alternative considered: in-memory storage. That lowers initial effort but makes reconnect, reload, and debugging less representative of the intended product.

### Use HTTP for commands and WebSocket for live text updates

Initial browser actions can be plain HTTP:

- create workspace
- list workspaces
- create session
- fetch session
- submit prompt

Live agent text updates should use WebSocket so the first implementation exercises the realtime path required by later approvals and running-state updates.

Alternative considered: Server-Sent Events. SSE is simpler for one-way updates, but later product work will need bidirectional realtime coordination. WebSocket is a better early foundation.

### Persist text messages at message boundaries, not every token

If ACP emits streaming text deltas, the backend can forward deltas live while coalescing them into a final persisted assistant message. The UI may also show in-progress content.

Persisting every token-level delta would create unnecessary storage noise for the first version.

Alternative considered: persist all deltas as append-only events. That is aligned with the long-term event model, but it is heavier than needed before non-text event replay is introduced.

### Keep unsupported ACP updates visible to developers

Non-text ACP updates are out of scope for the UI, but the backend should not crash when it receives them. It should log ignored update types and keep the session flow alive where possible.

If Codex requests permission during this slice, the backend can mark the session as blocked/unsupported and show a clear message that approval support is not yet implemented.

Alternative considered: silently ignore unsupported updates. That would make failures confusing and hide the next required product surface.

## Risks / Trade-offs

- `codex-acp` behavior may differ from the simplified ACP flow assumed here -> Validate with a thin manual smoke test as soon as the backend can initialize the process.
- ACP text response shapes may include mixed content or nested blocks -> Normalize only text content initially and log unknown content types for follow-up.
- Permission requests may appear earlier than expected -> Mark the session blocked with an unsupported-permission message rather than pretending the request succeeded.
- WSL network binding can be confusing from a phone -> Start with a configurable bind host/port and document the URL printed by the backend.
- SQLite schema may need revision once raw event storage arrives -> Keep this slice's schema small and migration-based.
- WebSocket reconnect can grow scope quickly -> For this slice, support reconnect by refetching session history and reopening the live channel; cursor-based replay can come later.

## Migration Plan

This is the first application implementation, so there is no existing runtime migration.

Implementation should introduce migrations for the initial SQLite schema. Rollback can remove the generated local database during development.

## Open Questions

- Which exact frontend stack should be used for the browser UI?
- Should the first backend binary also serve the frontend bundle, or should frontend and backend run as separate dev servers initially?
- What is the exact command used to launch `codex-acp` in the local environment?
- Which ACP Rust APIs are sufficient for client-side initialization, prompt submission, and text update handling?
- How should the UI label an unsupported permission request in the earliest version?
