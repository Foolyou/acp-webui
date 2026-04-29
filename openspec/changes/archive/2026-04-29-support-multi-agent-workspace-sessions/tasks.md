## 1. Agent Catalog and Storage

- [x] 1.1 Define stable agent ids, titles, default commands, args, and enabled/default-agent configuration for Codex and Claude.
- [x] 1.2 Add storage migration or projection support for a stable session `agent_id`, backfilling existing sessions to `codex`.
- [x] 1.3 Update session models, list/detail rows, and serialization types to expose selected agent id and display name.
- [x] 1.4 Preserve existing `agent_name` compatibility or migrate it safely without losing historical session display data.

## 2. Runtime Manager

- [x] 2.1 Rename or generalize the current Codex runtime into a reusable ACP agent runtime carrying an agent definition.
- [x] 2.2 Introduce an `AgentRuntimeManager` that owns one runtime per enabled agent.
- [x] 2.3 Scope ACP session maps, restore maps, assistant buffers, and permission responders to each runtime.
- [x] 2.4 Expose per-agent connection status, agent info, and session capabilities through app state and realtime events.
- [x] 2.5 Ensure one failed agent runtime does not prevent other ready runtimes from creating or continuing sessions.

## 3. Backend Session Routing

- [x] 3.1 Update workspace session creation to accept an optional `agentId`, validate it, and default omitted values to the configured default agent.
- [x] 3.2 Persist the selected agent id when creating a session and route `session/new` through that runtime.
- [x] 3.3 Route prompt submission by loading the session's persisted agent id before calling ACP.
- [x] 3.4 Route session restore and continuity projection through the session's persisted agent id.
- [x] 3.5 Route permission resolution and cancellation through the runtime that owns the permission request's session.
- [x] 3.6 Keep session timeline, review artifact, and approval realtime updates session-scoped while making connection status updates agent-scoped.

## 4. Claude Agent Support

- [x] 4.1 Add Claude runtime configuration using the current `@agentclientprotocol/claude-agent-acp` package name.
- [x] 4.2 Verify Claude initialization capability parsing for `loadSession` and nested `sessionCapabilities`.
- [x] 4.3 Verify Claude session creation and prompt submission through ACP with a fake or controlled fixture before using the real adapter.
- [x] 4.4 Verify Claude permission requests use the shared approval queue and resolve through the Claude runtime.
- [x] 4.5 Verify Claude `session/load` restoration succeeds and fails with the existing continuity states.
- [x] 4.6 Surface readable Claude authentication or configuration failures without blocking Codex sessions.

## 5. React Frontend

- [x] 5.1 Extend frontend API/types for agent catalog entries, per-agent statuses, and session selected-agent metadata.
- [x] 5.2 Add an agent selection control to the workspace/session creation flow.
- [x] 5.3 Disable unavailable agents and show per-agent failure or starting states during session creation.
- [x] 5.4 Display the selected agent identity in Session Detail and Sessions list rows.
- [x] 5.5 Keep persisted sessions reviewable when their selected agent runtime is failed, and gate composer actions with agent-specific reasons.
- [x] 5.6 Update realtime reducers to handle agent-scoped connection status events and existing session-scoped timeline events.

## 6. Tests and Documentation

- [x] 6.1 Add backend tests for agent catalog configuration and existing Codex session backfill.
- [x] 6.2 Add backend tests for creating Codex and Claude sessions in the same workspace.
- [x] 6.3 Add backend tests for prompt, restore, and permission routing by session agent id.
- [x] 6.4 Extend fake ACP fixtures or add fixture modes to simulate multiple configured agents with independent statuses.
- [x] 6.5 Add Playwright coverage for choosing Codex or Claude when creating a session.
- [x] 6.6 Add Playwright coverage showing one failed agent does not block session creation with another ready agent.
- [x] 6.7 Update README and product design notes with multi-agent session behavior, Claude adapter package name, runtime dependencies, and authentication expectations.
- [x] 6.8 Run backend tests, frontend build, and relevant Playwright E2E coverage.

## 7. Lazy Agent Runtime Startup

- [x] 7.1 Update OpenSpec artifacts to distinguish agent catalog availability from runtime lifecycle state.
- [x] 7.2 Change backend agent runtime management so Codex and Claude catalog entries default to idle and start on first session creation.
- [x] 7.3 Allow retryable failed agents to be selected again while keeping starting and disabled agents blocked.
- [x] 7.4 Update frontend session creation controls, copy, and tests for idle/start-on-create behavior.
- [x] 7.5 Update README, product notes, and helper script guidance so Claude no longer requires an explicit startup flag for normal use.
- [x] 7.6 Run OpenSpec validation, backend tests, frontend build, and relevant E2E coverage.
