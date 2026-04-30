## Why

ACP Web UI now supports more than one ACP agent, but its configuration model is still shaped around Codex-specific assumptions such as permission mode being the only runtime-affecting selector. Codex, Claude Code, OpenCode, and future providers expose different combinations of model, reasoning, speed, permissions, modes, skills, environment variables, and config-file options, so WebUI needs a provider-oriented configuration architecture before these differences become scattered across runtime, API, and React code.

## What Changes

- Introduce a provider configuration model that separates agent identity, provider adapter behavior, launch-time profiles, session-time ACP controls, and display projections.
- Replace the permission-mode-only runtime slot model with launch profiles that can include permission, speed, reasoning, model, and provider-specific startup settings.
- Preserve ACP `configOptions` as the preferred session-time configuration surface, while allowing provider adapters to supply fallback launch controls when an agent does not expose a setting through ACP.
- Add normalized UI/API control metadata with explicit scopes such as `launch`, `session`, and future-compatible `turn`/`prompt` scopes.
- Support reasoning effort and fast/speed controls through the common control model, with Codex, Claude Code, and OpenCode mappings handled by provider adapters rather than hard-coded in shared runtime code.
- Add skill-name autocomplete in the prompt composer using backend-discovered available skills and `$skill-name` insertion.
- Keep existing Codex and Claude session behavior compatible, including current permission mode selection and ACP model selection.

## Capabilities

### New Capabilities

- `agent-provider-configuration`: Defines provider adapters, launch profiles, scoped controls, and runtime identity for configurable ACP agents.
- `composer-skill-autocomplete`: Defines skill discovery and `$skill` autocomplete behavior in the browser prompt composer.

### Modified Capabilities

- `agent-runtime-management`: Runtime slots SHALL be keyed by launch-compatible profiles rather than only agent id and permission mode.
- `session-config-options`: Browser and backend SHALL treat ACP session configuration options as generic session controls, not just model selectors.
- `react-frontend-application`: The browser SHALL render scoped agent configuration controls and prompt composer skill autocomplete.
- `session-list`: Session rows SHALL expose enough normalized configuration summary to distinguish launch profile and current session controls.

## Impact

- Backend Rust models for agent catalog entries, runtime keys, session creation requests, session detail, session list rows, and skill discovery.
- Agent runtime manager startup and routing, especially Codex permission mode mapping currently centralized in static config code.
- SQLite storage for persisted session launch profile metadata and compact display summaries.
- React session creation controls, composer-adjacent session controls, sessions list metadata, and prompt composer autocomplete.
- Fake ACP fixtures and tests for Codex, Claude-like, and OpenCode-like configuration behavior.
- README or product documentation describing provider prerequisites and which settings are ACP-driven versus provider-adapter fallback behavior.
