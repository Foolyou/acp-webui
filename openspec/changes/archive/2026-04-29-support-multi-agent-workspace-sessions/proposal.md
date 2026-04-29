## Why

ACP Web UI currently treats Codex as the single runtime behind every workspace session, but the product direction requires users to create either Codex or Claude sessions inside the same workspace. Supporting Claude Code should therefore introduce session-level agent selection instead of replacing the existing Codex command with a Claude command.

## What Changes

- Add a configured ACP agent catalog with first-class `codex` and `claude` agent definitions.
- Generalize the backend runtime from a single Codex connection to multiple independently managed ACP agent runtimes.
- Allow users to choose Codex or Claude when creating a session in a workspace.
- Persist the selected agent identity on each session and route prompts, restoration, approvals, and realtime updates through that session's agent runtime.
- Add Claude support through the current `@agentclientprotocol/claude-agent-acp` adapter while keeping Codex support through `codex-acp`.
- Expose per-agent runtime status and capabilities so the browser can disable only the affected agent when one runtime is unavailable.
- Keep existing persisted Codex sessions usable, with migration or projection behavior that maps old `agent_name = codex` rows to the Codex definition.
- Document authentication expectations for Claude without building an in-app Claude login flow in this change.

## Capabilities

### New Capabilities

- `agent-runtime-management`: Defines configured ACP agent definitions, independent runtime lifecycle, status/capability discovery, and routing by session agent identity.
- `claude-agent-connection`: Defines Claude session support through the `@agentclientprotocol/claude-agent-acp` adapter, including initialization, session creation, prompting, permission requests, and restore eligibility.

### Modified Capabilities

- `workspace-session-chat`: Session creation changes from implicit Codex-backed sessions to explicit agent-backed sessions selected per workspace session.
- `session-list`: Session rows and workspace-scoped lists must represent the selected agent identity and per-agent continuity state.
- `react-frontend-application`: The React app must let users choose an available agent when creating a session and must surface per-agent readiness.
- `codex-agent-connection`: Codex remains supported, but its runtime is managed as one configured ACP agent instead of the only global runtime.

## Impact

- Backend configuration for agent definitions, commands, arguments, status, and default enabled agents.
- Backend runtime state, ACP child process management, session maps, restore maps, permission responders, and realtime event attribution.
- SQLite session storage and migrations for stable agent ids while preserving existing `agent_name` data.
- Workspace session creation API request body and validation.
- App state, session detail, session list, and WebSocket payloads that currently expose a single Codex connection status.
- React workspace/session creation flows, session metadata display, and disabled/error states for unavailable agents.
- Tests and fake ACP fixtures for Codex and Claude-compatible multi-agent behavior.
