## Why

Claude Code can run in `bypassPermissions` mode through its ACP adapter, but ACP Web UI currently exposes Claude only as a manual provider. This leaves users unable to start a clearly marked Claude YOLO session from the creation flow, while in-session ACP mode controls can already expose bypass behavior without updating the persisted session risk state.

## What Changes

- Advertise verified Claude permission modes in the agent catalog: `manual` and `yolo`.
- Map Claude `manual` to ACP session config option `mode=default`.
- Map Claude `yolo` to ACP session config option `mode=bypassPermissions`.
- During Claude session creation, set the requested ACP mode after `session/new` returns config options and before any initial prompt is submitted.
- Persist the selected local permission mode so Claude YOLO sessions use the same visible risk treatment as Codex YOLO sessions.
- Keep unsupported Claude modes, including `full_auto`, rejected until there is a verified product mapping.
- Add backend and frontend tests for catalog exposure, creation-time mode setting, failure behavior, and YOLO warnings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-permission-modes`: Claude SHALL support creating `manual` and `yolo` sessions with provider-specific mode mapping.
- `claude-agent-connection`: Claude session creation SHALL set the requested ACP permission mode before submitting the initial prompt.
- `session-config-options`: Claude ACP mode controls that indicate bypass behavior SHALL not undermine the persisted local permission mode and risk presentation.

## Impact

- Backend agent configuration in `config.go`.
- Session creation flow in `server.go` and ACP runtime helpers in `agent.go`.
- Storage projections only as needed to persist existing `permissionMode` values.
- Frontend permission mode rendering in session creation, detail, and list views.
- Backend unit tests around launch profile resolution and Claude session creation.
- Frontend tests around YOLO indicators and configuration controls.
