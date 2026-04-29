## Why

ACP Web UI is intended to supervise local agent work from a mobile browser, but it currently only supports the agent's default permission behavior. Users who deliberately want lower-friction Codex sessions need an explicit, visible way to start sessions in automatic or YOLO permission modes without changing the daemon's hidden global launch configuration.

Adding session-scoped permission modes now resolves the open product-design question around YOLO scope and keeps the safety boundary visible in the session UI.

## What Changes

- Add session permission modes for new sessions: `manual`, `full_auto`, and `yolo`.
- Keep `manual` as the default mode, preserving the existing ACP permission approval flow.
- Launch or select Codex ACP runtimes with mode-specific configuration so `full_auto` and `yolo` map to Codex's supported approval and sandbox behavior.
- Persist each session's selected permission mode and expose it through session detail and session list APIs.
- Show the selected permission mode in session creation, Session Detail, and Sessions list, with a prominent warning/indicator for `yolo`.
- Prevent changing permission mode for an existing session in the first version; users create a new session to change mode.
- Keep unsupported agents from offering unsupported permission modes until their adapters expose a verified mapping.
- Correct stale documentation/spec references that still say `allow_always` and `reject_always` approval options are disabled.

## Capabilities

### New Capabilities

- `session-permission-modes`: Session-scoped permission mode selection, persistence, API projection, agent support gating, and visible UI indicators.

### Modified Capabilities

- `workspace-session-chat`: Session creation accepts and persists a selected permission mode.
- `agent-runtime-management`: Runtime management isolates ACP processes by agent and permission mode where launch configuration differs.
- `codex-agent-connection`: Codex ACP launch configuration maps WebUI permission modes to Codex approval and sandbox settings.
- `session-list`: Session list rows expose compact permission mode metadata.
- `react-frontend-application`: The browser renders permission mode choices and visible mode indicators, and updates stale always-option expectations.

## Impact

- Storage needs a migration for the selected session permission mode.
- Backend API models and session creation route need a `permissionMode` field with validation and defaults.
- Agent runtime management needs a runtime key that can distinguish one agent in different permission modes.
- Codex runtime configuration needs mode-specific `codex-acp -c` overrides or equivalent launch arguments.
- React session creation, Session Detail, Sessions list, and E2E coverage need permission mode controls and indicators.
- README and affected OpenSpec specs need alignment with current always-option behavior.
