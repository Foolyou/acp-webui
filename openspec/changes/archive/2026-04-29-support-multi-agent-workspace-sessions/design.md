## Context

ACP Web UI currently has the right protocol boundary for multiple agents but the product model is still Codex-shaped. The backend launches one configured ACP child process, stores sessions with `agent_name = codex`, exposes one connection status, and routes all session creation, prompts, restore attempts, permission responses, and realtime updates through that single runtime.

Claude Code support changes the product model. Users should be able to open one workspace and create separate Codex or Claude sessions in that workspace:

```text
Workspace
  |
  +-- Session A: agent_id=codex  -> codex ACP runtime
  +-- Session B: agent_id=claude -> claude ACP runtime
  +-- Session C: agent_id=codex  -> codex ACP runtime
```

The current Claude ACP path is the `@agentclientprotocol/claude-agent-acp` package. The old `@zed-industries/claude-code-acp` and `@zed-industries/claude-agent-acp` package names are deprecated in favor of the `@agentclientprotocol` package. The adapter is an ACP agent over stdio and reports ACP capabilities such as `loadSession` and nested `sessionCapabilities`.

Two active completed changes are relevant background:

- `support-acp-session-resume` adds capability-gated `session/load` restoration and continuation states.
- `support-queued-approval-requests` adds ordered approval queues.

This change should be compatible with both, even if those changes are archived before or after this one.

## Goals / Non-Goals

**Goals:**

- Let users create either Codex or Claude sessions in the same workspace.
- Keep agent selection session-scoped, not workspace-scoped.
- Preserve existing Codex behavior and migrated persisted Codex sessions.
- Add Claude support through the current ACP adapter package.
- Route session operations through the session's owning agent runtime.
- Expose independent readiness, failure, and capability state for each configured agent.
- Keep ACP as the contract for prompts, permissions, tool calls, review artifacts, and session continuation.

**Non-Goals:**

- Do not parse private Codex or Claude transcript files.
- Do not build an in-app Claude authentication or account-management flow.
- Do not add a full settings UI for arbitrary custom agents in the first pass.
- Do not run multiple agents inside one session.
- Do not queue prompts across agents or allow multiple prompts in one running session.
- Do not implement `session/resume` as a continuation path unless it is already covered by the existing continuation implementation.
- Do not bundle Codex, Claude, Node.js, or npm packages into the ACP Web UI binary.

## Decisions

### Agent identity is a session attribute

Each local session will store a stable `agent_id`, such as `codex` or `claude`. Workspace remains only the filesystem/project boundary.

Alternative considered: make workspace choose a single active agent. That blocks the core user workflow of comparing or alternating Codex and Claude within one project and makes historical sessions ambiguous when the workspace default changes.

Alternative considered: treat the current command-line runtime as the selected agent and let users restart the daemon to switch. That is not a usable multi-agent product model and would make session continuity depend on process launch history.

### Use a configured agent catalog before a dynamic settings UI

The first implementation should define a small configured catalog at startup. Catalog membership answers "can this product offer this agent?" It does not mean the ACP child process has already been launched.

```text
agent_id  title         default command
codex     Codex         codex-acp
claude    Claude        npx --yes @agentclientprotocol/claude-agent-acp
```

Configuration should allow overriding command and args per agent. Agents can be hidden or disabled by deliberate configuration later, but Codex and Claude should be present by default. The browser can show all configured agents and their current runtime state, including agents whose runtime has not started yet.

Alternative considered: build a full user-editable agent settings system first. That increases scope and is not required to validate session-level Codex/Claude support.

### Start ACP runtimes lazily per available agent

The backend will manage an `AgentRuntimeManager` that owns one lazy ACP runtime slot per available agent. Each slot starts in `idle` state and creates its child process only when an operation needs that agent, such as creating a session or restoring an existing session. Once started, the runtime owns its child process, JSON-RPC peer, capability state, session maps, restore maps, assistant buffers, and permission responders.

```text
AppState
  |
  +-- AgentRuntimeManager
        |
        +-- codex  -> RuntimeSlot(idle | starting | ready | failed)
        |              +-- AgentRuntime(command=codex-acp) when started
        |
        +-- claude -> RuntimeSlot(idle | starting | ready | failed)
                       +-- AgentRuntime(command=npx ...claude-agent-acp) when started
```

This matches the ACP model where an agent connection can support multiple sessions without forcing all adapters to launch during daemon startup. If a future agent requires process-per-session isolation, that should be an agent-specific runtime strategy behind the same manager API, not a product-level session model change.

Alternative considered: start every configured runtime during backend startup. That makes startup slower, requires Claude/Node/auth prerequisites even when the user only wants Codex, and prevents the product from offering Claude as an option before its runtime has been launched.

Alternative considered: spawn a fresh ACP process per session. That isolates failures but increases startup cost, loses useful multi-session capability support, and complicates restoration and permission routing.

### Runtime availability is separate from lifecycle state

Agent catalog availability and runtime lifecycle must be represented separately:

```text
available/enabled
  - the product can offer this agent as a session choice
  - command and args are configured

runtime status
  - idle: catalog entry exists but no ACP child process is running yet
  - starting: a user action triggered launch/initialize
  - ready: initialized and usable
  - failed: launch/initialize failed; a later user action may retry
  - disabled: deliberately unavailable by configuration
```

`idle` and `failed` agents can still be selected for new session creation. Selecting them asks the backend to start or retry the runtime. `starting` agents should show progress and avoid duplicate creation requests while the launch attempt is in progress. `disabled` agents should not be selectable.

### Route by local session id, then agent id

Public APIs that act on an existing session should not require clients to repeat `agent_id`. The backend should load the session row, read its `agent_id`, select that runtime, and then use the persisted external ACP session id.

This applies to:

- prompt submission
- restore
- permission resolution and cancellation
- session continuity projection
- review evidence linked to ACP updates

Creation is the exception: `POST /api/workspaces/:workspace_id/sessions` should accept an `agentId`. For backward compatibility, a missing `agentId` can default to `codex`.

Alternative considered: include `agent_id` in every API route. That creates mismatch risks between URL/body and persisted session state and leaks routing concerns into the frontend.

### Persist stable agent id and preserve display snapshots

Storage should persist the stable agent id on each session. Existing `agent_name` data can either be migrated into `agent_id` or kept as a display snapshot while adding `agent_id`. The important invariant is that a historical session can always be routed to the same agent definition after restart.

Recommended shape:

```text
sessions
  agent_id TEXT NOT NULL DEFAULT 'codex'
  agent_name TEXT NOT NULL
```

The `agent_name` column can remain as a display snapshot or be backfilled from the catalog title. Existing rows with `agent_name = codex` should map to `agent_id = codex`.

Alternative considered: infer agent from external session id shape. That depends on private agent behavior and cannot be trusted across adapters.

### Treat Claude authentication as an external prerequisite for now

The first Claude integration should require users to have Claude authentication available in the local environment used to launch the adapter. ACP Web UI should expose readable startup or prompt errors when Claude is not authenticated.

The app should not advertise ACP terminal auth capabilities or implement `authenticate` until there is a deliberate authentication UI design. This avoids a partial login flow on mobile that is hard to secure and hard to test.

Alternative considered: implement Claude login immediately through adapter auth methods. That turns this change into auth UX and credential-handling work rather than multi-agent session support.

### Keep ACP update normalization shared

Codex and Claude should use the same ACP normalization pipeline for assistant text, user replay, tool calls, review artifacts, and permission requests. Agent-specific metadata should remain in stored raw payloads or `_meta` fields and only be elevated to product UI when there is a cross-agent requirement.

The Claude adapter emits useful updates such as plan entries, terminal metadata, model/mode options, and command lists. This change should not require complete UI support for all of them before basic Claude sessions work.

Alternative considered: build a Claude-specific timeline renderer first. That would split behavior by agent and make future ACP agents harder to support.

## Risks / Trade-offs

- Claude adapter requires local Node/npm availability when launched through `npx` -> Document the dependency and show per-agent launch errors without blocking Codex.
- Claude authentication can fail after initialization or on first prompt -> Surface prompt-turn errors in the owning session and keep other sessions unaffected.
- Two agents can produce the same ACP session id string -> Scope in-memory maps by runtime and persist local session ids as the product identity.
- Realtime connection status events currently assume one Codex runtime -> Introduce agent-scoped status events while preserving session-scoped events for timeline updates.
- Existing UI copy says Codex in several places -> Replace user-visible copy with agent-aware labels while preserving Codex-specific docs where relevant.
- More runtimes consume more resources -> Keep configured agents idle until first use, and retry failed agents only when a user action explicitly needs that agent.
- Active OpenSpec changes touch continuity and approvals -> Keep this change routing-focused and reuse their final contracts after archive.

## Migration Plan

1. Add configured agent definitions for Codex and Claude with stable ids and display titles.
2. Add or backfill session `agent_id`, mapping all existing sessions to `codex`.
3. Generalize the current Codex runtime type into an agent runtime that carries an agent definition.
4. Add an agent runtime manager and update app state to expose per-agent statuses, including `idle` for not-yet-started runtimes.
5. Update session creation to accept `agentId` and default omitted values to `codex`.
6. Route prompt, restore, permission resolution, cancellation, and continuity through the session's `agent_id`, starting that runtime on demand where the operation can safely recreate a live ACP connection.
7. Add Claude runtime configuration and smoke coverage through a fake ACP process before validating with the real adapter.
8. Update React creation flows and labels to show agent choices and independent failures.
9. Update README/product notes with runtime dependencies and Claude authentication expectations.

Rollback is straightforward if the storage migration keeps `codex` as the default agent id: disable or hide the Claude catalog entry and keep Codex as the only available agent. Persisted Claude sessions would remain view-only until Claude support is re-enabled.

## Open Questions

- Should the first failed runtime attempt show a retry affordance directly on the agent card, or is selecting that agent again enough?
- Should missing `agentId` on session creation default to `codex` permanently for API compatibility, or only during a transition period?
- Should the browser expose model/mode controls from Claude and Codex in a later shared agent settings surface?
- Should Claude's `session/resume` capability remain hidden until ACP Web UI implements the no-history-replay resume path?
