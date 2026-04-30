## 1. Data Model And Storage

- [ ] 1.1 Add Rust models for provider ids, launch profiles, scoped controls, control values, selected launch controls, and display-safe configuration summaries.
- [ ] 1.2 Add a SQLite migration for persisted session launch profile id/key and display-safe selected launch control snapshot.
- [ ] 1.3 Update session creation, detail, and list storage projections to persist and return launch profile metadata while preserving existing `permissionMode` compatibility.
- [ ] 1.4 Add serialization tests that reject or omit secrets, resolved environment values, and machine-specific command paths from browser-facing control metadata.

## 2. Provider Adapter Layer

- [ ] 2.1 Introduce a provider adapter abstraction that resolves command defaults, launch controls, launch profiles, and provider-specific command/env/config mappings.
- [ ] 2.2 Move Codex permission mode mapping out of generic config code into the Codex provider adapter.
- [ ] 2.3 Add Codex fallback mappings for reasoning effort and fast speed controls where ACP does not advertise equivalent session controls.
- [ ] 2.4 Add Claude provider launch control definitions for verified effort and fast mode fallback behavior without assuming unsupported modes.
- [ ] 2.5 Add OpenCode provider definition using `opencode acp` and launch mapping hooks for model, variant, reasoning, and provider options.
- [ ] 2.6 Keep a generic ACP provider path for agents that only need command, args, and ACP-provided controls.

## 3. Runtime Management

- [ ] 3.1 Replace runtime slot identity based on agent id plus permission mode with agent id plus canonical launch profile key.
- [ ] 3.2 Ensure incompatible launch profiles do not share ACP session maps, permission responders, assistant buffers, restore maps, or connection status.
- [ ] 3.3 Preserve existing Codex manual behavior for sessions without persisted launch profile metadata.
- [ ] 3.4 Update per-agent and per-profile runtime status events and app-state responses.
- [ ] 3.5 Add fake runtime coverage for compatible profile reuse and incompatible profile isolation.

## 4. Backend APIs And ACP Controls

- [ ] 4.1 Extend session creation requests to accept selected launch control values while continuing to accept existing `agentId` and `permissionMode`.
- [ ] 4.2 Return provider-backed launch controls in app state and display selected launch controls in session detail.
- [ ] 4.3 Project ACP `configOptions` into generic session-scoped controls while preserving current model projection.
- [ ] 4.4 Update `session/set_config_option` responses and realtime events so generic session controls and compact summaries stay synchronized.
- [ ] 4.5 Add backend validation for unsupported launch control values and non-idle session control updates.

## 5. Frontend Configuration UI

- [ ] 5.1 Replace session creation permission-mode-only controls with agent launch controls grouped by agent and risk level.
- [ ] 5.2 Preserve existing Manual, Full auto, and YOLO creation affordances through the new launch control model.
- [ ] 5.3 Replace the model-only composer control with generic session controls for supported ACP select options.
- [ ] 5.4 Keep current model summaries and add compact launch/session control summaries in Session Detail and Sessions list.
- [ ] 5.5 Add disabled and error states for launch controls, session controls, unavailable runtimes, and rejected control updates.

## 6. Skill Autocomplete

- [ ] 6.1 Add a backend skill discovery service and API that returns skill names, descriptions, source categories, enabled state, and duplicate disambiguation metadata.
- [ ] 6.2 Cache or debounce skill discovery so malformed or numerous skills do not block normal app state loading.
- [ ] 6.3 Add prompt composer `$skill` trigger detection, filtering, menu rendering, keyboard navigation, pointer selection, and insertion.
- [ ] 6.4 Preserve prompt submission shortcuts, IME composition behavior, disabled composer behavior, and normal typing when autocomplete data is unavailable.

## 7. Tests And Documentation

- [ ] 7.1 Extend fake ACP fixtures to advertise non-model session config controls and dependent config updates.
- [ ] 7.2 Add backend tests for provider adapter mappings, launch profile persistence, runtime routing, and generic ACP session control projection.
- [ ] 7.3 Add frontend unit tests for control extraction, session list summary updates, and skill mention insertion.
- [ ] 7.4 Add Playwright coverage for launch control session creation, generic session controls, realtime config updates, and skill autocomplete.
- [ ] 7.5 Update README or product documentation to explain ACP-backed controls versus provider-adapter fallback controls for Codex, Claude, OpenCode, and generic ACP agents.
- [ ] 7.6 Run `openspec validate generalize-agent-provider-configuration --strict`, backend tests, frontend tests, and relevant E2E coverage before marking tasks complete.
