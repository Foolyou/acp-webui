# ACP Web UI Product Design

Status: exploratory draft
Date: 2026-04-26

## 1. Background

ACP Web UI is intended to be a mobile-first local web interface for agents that implement Agent Client Protocol (ACP).

The initial target is Codex through Zed's `codex-acp`, with near-term expansion to Claude Code, OpenCode, and other ACP-compatible agents.

The product should not be treated as a mobile IDE. Its primary role is a local-first mobile cockpit for supervising, guiding, approving, and reviewing agent work.

Relevant references:

- ACP introduction: https://agentclientprotocol.com/get-started/introduction
- ACP architecture: https://agentclientprotocol.com/get-started/architecture
- ACP protocol overview: https://agentclientprotocol.com/protocol/overview
- ACP prompt turn: https://agentclientprotocol.com/protocol/prompt-turn
- ACP tool calls: https://agentclientprotocol.com/protocol/tool-calls
- ACP file system: https://agentclientprotocol.com/protocol/file-system
- ACP Rust library: https://agentclientprotocol.com/libraries/rust
- Zed `codex-acp`: https://github.com/zed-industries/codex-acp

## 2. Product Positioning

ACP Web UI is a local-first mobile cockpit for ACP agents.

It enables a user to open a normal mobile browser, connect to a backend running on their development machine, and interact with a local agent process through ACP.

The core jobs are:

- Start and continue agent sessions through natural language prompts.
- Observe what the agent is doing in real time.
- Approve or reject high-risk operations requested by the agent.
- Review code changes, diffs, Markdown output, terminal output, and other artifacts.
- Cancel a running turn when needed.

The first version should prioritize supervision and review over code editing. Direct mobile code editing is explicitly not a priority.

## 3. Product Architecture Decisions

### 3.1 Overall Shape

The system has three major parts:

```text
Mobile Browser
  - normal web page
  - full-screen display support
  - WebSocket reconnect support
        |
        | HTTP / WebSocket
        v
Rust Local Daemon
  - runs on the development machine
  - exposes service on a user-selected IP and port
  - acts as a headless ACP client
  - persists session events locally
        |
        | stdio JSON-RPC
        v
ACP Agent Adapter
  - first target: codex-acp
  - later: Claude Code, OpenCode, other ACP agents
```

The backend is not merely a generic API wrapper. It should be understood as a headless ACP client: it provides the client-side capabilities that a desktop editor would normally provide, while the mobile browser provides the user interaction surface.

### 3.2 Local-First Scope

The product is local-first.

The initial deployment target is a developer's own machine, especially Linux running inside WSL. Windows and macOS support should follow soon after, but Linux/WSL is the initial priority.

The product does not need team collaboration, multi-user workspaces, shared sessions, organization-level authorization, or audit trails in the first version.

### 3.3 Network Binding

The backend should expose a service on a user-selected local IP address and port.

The user already has Tailscale networking available, but ACP Web UI should not need to understand Tailscale directly. At startup, the backend should let the user choose which network interface or IP address to bind.

The backend should not default to broad, unsafe exposure. Pairing token authentication is acceptable as the first version's access control.

### 3.4 Agent Support Strategy

The first supported agent is Codex through `codex-acp`.

The design should still avoid baking Codex-specific assumptions into core UI and storage concepts. Near-term support for Claude Code and OpenCode is expected.

Agent integration should be modeled around ACP concepts and capabilities:

- Agent definition
- Agent process
- ACP connection
- Session
- Prompt turn
- Permission request
- Tool call
- Session update
- Artifact

### 3.5 ACP Session Model

The system should follow the ACP model.

An agent connection may support multiple sessions. The first design should not assume one process per session unless later evidence shows that a specific agent requires it.

### 3.6 Permission Model

Permission behavior should follow ACP as directly as possible.

The backend should forward ACP permission requests to the mobile UI and return the user's decision to the agent. The product should not invent a large extra policy engine in the first version.

High-risk operations are expected to require approval according to the agent's own behavior.

The product should support a yolo mode, but yolo mode must be visible and scoped deliberately. The first design preference is session or workspace scope rather than a hidden global default.

### 3.7 Review Data Source

Diff and review data should prefer ACP-provided updates or artifacts.

If ACP does not provide enough diff data, the Review page may fall back to running `git diff` in the workspace. This fallback should happen when the Review page requests it, not eagerly after every file write.

### 3.8 Persistence

SQLite is the initial storage choice.

Session history, events, terminal output, permission requests, and useful artifacts should persist across backend restarts.

Terminal output should be persisted, but the design should leave room for retention or expiration policies to prevent unbounded local data growth.

## 4. Core Product Experience Decisions

### 4.1 Primary Navigation

The mobile UI should use a small set of bottom-level areas:

- Inbox
- Sessions
- Review
- Settings

Inbox and Session Detail are expected to be the highest-frequency surfaces.

### 4.2 Inbox

Inbox should answer: "Is anything waiting for me?"

It should prioritize:

- Sessions waiting for permission approval
- Running sessions
- Failed or interrupted sessions
- Sessions that need user input

The mobile first screen should be actionable, not a marketing or dashboard overview.

### 4.3 Session List

The session list should show all sessions with compact status:

- Workspace
- Agent
- Current state
- Last activity
- Whether approval is pending
- Whether changes or artifacts are available

### 4.4 Session Detail

Session Detail is the core cockpit.

It should answer three questions:

- What did I ask the agent to do?
- What is it doing now?
- Does it need a decision from me?

The preferred shape is a middle ground between a chat page and a CI job page.

It should preserve the natural flow of prompt and response, while presenting tool calls, approvals, diffs, terminal output, and plans as structured cards.

Suggested layout:

```text
Header
  agent / workspace / status / yolo indicator / cancel

Active State Strip
  running state, current action, pending approval, current plan step

Timeline
  user prompts
  agent messages
  plan cards
  grouped tool calls
  terminal snippets
  diff and Markdown artifact entries
  final result

Footer
  prompt composer when idle
  cancel control when running

Overlay
  approval bottom sheet
  full-screen artifact viewer
```

### 4.5 Session State Model

The initial session interaction model should be:

```text
idle
  -> submitting
  -> running
  -> waiting_approval
  -> running
  -> completed | failed | cancelled
```

`waiting_approval` should be treated as a blocking sub-state of a running session.

While a session turn is running, the first version should not allow another prompt to be queued. The UI should show a cancel action instead. Prompt queueing can be considered later.

### 4.6 Timeline Behavior

The timeline should not be a raw log.

Mobile display space is limited, so the timeline should be grouped and editorially folded:

- User prompts should be readable and complete.
- Agent text should stream live and remain readable after completion.
- Plans should appear as compact expandable cards.
- Tool calls should be grouped where possible.
- High-risk tool calls should expose important details by default.
- Terminal output should show a tail snippet with an option to open full output.
- Diff changes should show a summary and link to Review.
- Markdown artifacts should offer preview.

Session Detail should tell the story of the work. Review should expose the evidence in detail.

### 4.7 Approval Experience

Approval should not be treated as a normal timeline card.

A pending permission request should appear as a blocking bottom sheet or similarly prominent mobile interaction.

It should include enough context to decide:

- Requested operation
- Agent
- Workspace
- Current directory, if relevant
- Command or file operation, if relevant
- ACP-provided details
- Allow and reject actions

If the browser disconnects, the pending approval should remain stored on the backend. After reconnect, the UI should immediately restore the pending approval state.

### 4.8 Review Experience

Review is for detailed inspection, not for first-level session narration.

The Review page should support:

- Unified diff browsing optimized for mobile
- Changed file list
- Hunk-level navigation
- Markdown preview
- Terminal output review
- ACP artifact display
- `git diff` fallback on demand

Side-by-side diff is not a first-version priority on mobile.

### 4.9 Markdown Preview

Markdown output should be previewable because agent work often produces plans, reports, summaries, and documentation.

Markdown preview is part of review, not a replacement for raw artifact access.

### 4.10 Full-Screen and Reconnect

The frontend does not need to be a PWA in the first version.

It should still support:

- Mobile full-screen-friendly layout
- Reconnecting WebSocket behavior
- Event replay after reconnect
- Clear visible state when disconnected or reconnecting

## 5. Event Model Exploration

### 5.1 Why an Internal Event Model Is Needed

The mobile UI should not consume raw ACP messages directly.

The system needs an internal event model because the UI requires:

- WebSocket replay after disconnect
- Session timeline rendering
- Inbox projections
- Pending approval queues
- Review artifacts
- Terminal snapshots
- Durable local history

The backend should keep raw ACP messages for debugging and compatibility, but normalized events should power the UI.

### 5.2 Event Layers

The system should maintain three conceptual layers:

```text
Raw ACP Message
  exact JSON-RPC message
  used for debugging, compatibility, protocol evolution

Normalized Event
  product-level event understood by ACP Web UI
  used for WebSocket replay and session timeline

Projection
  query-friendly current state
  used by Inbox, Session list, Approval queue, Review list
```

### 5.3 Candidate Normalized Events

Initial normalized events may include:

- `session_created`
- `session_loaded`
- `turn_started`
- `user_prompt_submitted`
- `agent_message_started`
- `agent_message_delta`
- `agent_message_finished`
- `plan_updated`
- `tool_call_started`
- `tool_call_updated`
- `tool_call_finished`
- `permission_requested`
- `permission_resolved`
- `terminal_output_delta`
- `file_write_observed`
- `diff_artifact_available`
- `markdown_artifact_available`
- `artifact_available`
- `permission_mode_changed`
- `turn_completed`
- `turn_failed`
- `turn_cancelled`
- `session_error`

This list is exploratory and should be refined against actual `codex-acp` behavior.

### 5.4 Permission as a First-Class Event

`permission_requested` must be a first-class durable event and should also have a durable pending request record.

The lifecycle should be:

```text
ACP permission request
        |
        v
persist pending permission request
        |
        +--> push to mobile UI if connected
        |
        +--> survive browser disconnect
        |
        v
user approves or rejects
        |
        v
persist resolution
        |
        v
respond to ACP agent
```

### 5.5 Reconnect and Replay

The WebSocket protocol should support replay from a known event cursor, such as `last_event_id`.

On reconnect, the backend should send missed normalized events and the current projection state needed to restore:

- Session timeline
- Running state
- Pending approval sheet
- Disconnection banner state
- Current artifact summaries

## 6. Technical Direction

### 6.1 Backend

Rust is the preferred backend language because the backend is a local daemon that manages child processes, stdio, network binding, concurrency, and durable local state.

Candidate libraries:

- `tokio` for async runtime, process handling, and IO
- `axum` for HTTP and WebSocket server
- `agent-client-protocol` for ACP concepts and client integration
- `sqlx` with SQLite for persistence
- `tower-http` for HTTP middleware
- `tracing` for structured diagnostics
- a network interface discovery crate such as `if-addrs` or similar

### 6.2 Frontend

Frontend technology is not finalized.

The UI should be mobile-first and optimized for:

- Touch interaction
- Narrow viewport readability
- Bottom navigation
- Bottom sheets for approvals
- Streaming event display
- Diff and Markdown viewing
- Stable layout under reconnect and live updates

### 6.3 Storage

SQLite is the initial persistence layer.

Likely data areas:

- Agents
- Workspaces
- Agent processes
- Sessions
- Session events
- Raw ACP messages
- Permission requests
- Artifacts
- Terminal output
- App settings

The schema should leave room for retention policies, especially for terminal output and raw ACP logs.

### 6.4 Backend Modules

Potential backend modules:

- `server`: HTTP, WebSocket, static frontend hosting
- `net`: network interface enumeration and bind address selection
- `auth`: pairing token authentication
- `agents`: agent definitions and launch configuration
- `acp`: ACP runtime and stdio JSON-RPC bridge
- `sessions`: session lifecycle and prompt turns
- `permissions`: ACP permission request forwarding and resolution
- `events`: raw and normalized event persistence
- `storage`: SQLite access
- `workspace`: workspace allowlist and path safety
- `review`: ACP diff and on-demand `git diff` fallback

### 6.5 Platform Priorities

Initial platform priority:

1. Linux / WSL
2. Windows
3. macOS

The design should avoid Linux-only assumptions where practical, but the first validation target is WSL.

## 7. Open Questions

These are not yet decided:

- Whether the frontend should use React, Solid, Svelte, or another stack.
- Whether the backend should serve the frontend bundle directly or keep frontend and backend separate during early development.
- How much raw ACP data should be retained by default.
- What retention policy should apply to terminal output.
- How yolo mode should be scoped in the final product: session, workspace, process, or app-level.
- Whether Review should support comments or checklist-style review notes later.
- How much agent capability discovery should be reflected directly in the UI.
- Whether `git diff` fallback should support unstaged only, staged plus unstaged, or configurable modes.
- How cancellation maps to ACP and individual agent behavior across Codex, Claude Code, and OpenCode.

## 8. Current Decisions Summary

Product architecture decisions:

- Build a mobile-first local ACP cockpit, not a mobile IDE.
- Use a Rust local daemon as a headless ACP client.
- Connect to agent adapters through stdio JSON-RPC.
- Start with Codex through `codex-acp`.
- Design for near-term multi-agent support.
- Use pairing token authentication in the first version.
- Let the user select bind IP/interface and port at startup.
- Prioritize Linux/WSL first, then Windows and macOS.
- Use SQLite for local persistence.

Core experience decisions:

- Primary surfaces: Inbox, Sessions, Review, Settings.
- Session Detail is the core cockpit.
- Session Detail should combine chat-like flow with structured job-like cards.
- Approval must be prominent, blocking, durable, and recoverable after reconnect.
- Running turns do not accept queued prompts in the first version; show cancel instead.
- Review supports mobile unified diff, Markdown preview, terminal output, and artifacts.
- Diff source prefers ACP and falls back to `git diff` on Review page request.
- The frontend does not need to be a PWA, but must support full-screen-friendly layout and reconnect.

Technical initial information:

- Backend: Rust, likely `tokio`, `axum`, `sqlx`, SQLite, ACP Rust crate.
- Communication: browser to backend over HTTP/WebSocket; backend to agent over stdio JSON-RPC.
- Persistence: raw ACP messages, normalized events, projections, permissions, artifacts, terminal output.
- Event model: normalized append-only events with projections for Inbox, timeline, approval, and review.

