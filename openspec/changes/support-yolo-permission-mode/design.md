## Context

ACP Web UI already has session-scoped agent selection, lazy per-agent ACP runtimes, persisted sessions, and durable approval requests. The missing piece is permission-mode selection: users can only use the approval behavior implied by the daemon's current agent launch arguments.

Codex exposes low-friction modes at the CLI level, including `--full-auto` and `--dangerously-bypass-approvals-and-sandbox`. The local `codex-acp` wrapper currently exposes arbitrary `-c key=value` config overrides rather than those convenience flags directly, so WebUI should model permission modes in its own product/API layer and map them to agent-specific launch configuration behind the runtime manager.

The important architectural constraint is that permission behavior is process configuration for Codex ACP, not a known ACP `session/new` parameter. ACP Web UI therefore cannot safely run `manual` and `yolo` Codex sessions through the same child process.

## Goals / Non-Goals

**Goals:**

- Let users choose `manual`, `full_auto`, or `yolo` when creating a new supported session.
- Keep `manual` as the default and preserve the existing approval queue behavior.
- Persist the selected permission mode on each session.
- Route existing session operations through a runtime compatible with the session's agent and permission mode.
- Make `yolo` visually explicit in creation flows, Session Detail, and Sessions list.
- Keep unsupported agents from offering unsupported modes.
- Align README and frontend specs with current selectable `allow_always` / `reject_always` behavior.

**Non-Goals:**

- No runtime mode switching for an existing session.
- No remembered local allow/reject policy engine.
- No global YOLO default in the first version.
- No ACP protocol extension for permission mode unless a future agent capability standardizes one.
- No attempt to force Claude or future agents into YOLO without a verified adapter-specific mapping.

## Decisions

### Store permission mode on the session

Add a `permission_mode` field to the local `sessions` table with `manual` as the default for existing rows. Session detail and list projections should expose this field as compact metadata.

Alternative considered: store mode only in runtime state. That loses the safety context after reload and makes restored sessions ambiguous.

### Select permission mode only at session creation

The browser will send `permissionMode` with `POST /api/workspaces/:workspace_id/sessions`. Missing values default to `manual` for API compatibility. The first version will not expose an endpoint to change mode for an existing session.

Alternative considered: allow mode switching inside Session Detail. That creates hard-to-explain behavior when a live ACP process already owns session state under a different launch configuration.

### Use runtime keys that include permission mode

The runtime manager should identify mode-sensitive runtime slots by agent id plus permission mode. Codex can share multiple sessions within one `(codex, manual)` runtime, but `codex/manual`, `codex/full_auto`, and `codex/yolo` must be separate child processes.

Alternative considered: spawn one ACP process per session. That avoids mixed-mode sharing but gives up the current multi-session runtime model and increases startup cost.

### Keep agent support explicit

Agent definitions should advertise supported permission modes. Codex supports all three modes after its config mapping is implemented. Claude should initially expose only `manual` unless its adapter has a verified equivalent for automatic or YOLO execution.

Alternative considered: show all modes for every agent and fail at creation time. That is noisier and invites unsafe assumptions about adapter behavior.

### Map modes to agent launch configuration

For Codex:

- `manual`: launch with existing configured Codex ACP command and args.
- `full_auto`: append `-c approval_policy="on-request" -c sandbox_mode="workspace-write"`, matching the verified Codex CLI `--full-auto` prompt-input behavior for sandboxed automatic execution.
- `yolo`: append `-c approval_policy="never" -c sandbox_mode="danger-full-access"`, matching the verified Codex CLI `--dangerously-bypass-approvals-and-sandbox` behavior.

Implementation should prefer `codex-acp -c ...` overrides because `codex-acp --help` exposes config overrides and not the Codex TUI convenience flags. The exact config keys should be verified during implementation against the installed Codex version and covered by fake-runtime tests.

Alternative considered: append Codex CLI convenience flags directly to `codex-acp`. Local help does not show those flags on `codex-acp`, so this is less defensible.

### Treat YOLO as a visible safety state

`yolo` is not just a backend flag. It should be visible wherever a user can create, inspect, or resume a session. It should use direct copy such as "YOLO" or "No approvals / no sandbox" and avoid looking like a normal status badge.

Alternative considered: only show the mode in settings or logs. That hides the risk from the mobile cockpit where the user actually supervises agent work.

## Risks / Trade-offs

- Incorrect Codex config mapping -> Verify against local `codex-acp` behavior during implementation and keep mappings centralized.
- Runtime count grows by mode -> Limit mode-sensitive slots to selected modes and keep lazy startup.
- Users may assume YOLO affects old sessions -> Persist mode per session and disallow switching existing sessions.
- Unsupported agents may later gain equivalent modes -> Keep support metadata per agent so new mappings can be added without changing the session contract.
- Documentation already conflicts on always options -> Update stale docs/specs in the same change so permission behavior is internally consistent.

## Migration Plan

1. Add a nullable-safe migration that defaults existing sessions to `manual`.
2. Update Rust models, storage rows, session detail, and session list projections to include permission mode.
3. Extend session creation validation and persist selected mode.
4. Change runtime manager slot identity from agent-only to agent plus permission mode where mode-specific launch configuration exists.
5. Add Codex mode mapping and fake ACP coverage for mode-specific process startup.
6. Update React creation controls and mode indicators.
7. Update README and stale frontend spec expectations around always options.

Rollback is straightforward: keep the `permission_mode` column ignored by old code, continue defaulting sessions to `manual`, and hide non-manual mode controls.

## Open Questions

- Should future app settings allow choosing a default permission mode per workspace, or should every non-manual session require explicit selection?
