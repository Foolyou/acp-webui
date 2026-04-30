## Context

ACP Web UI already has session-scoped agent selection, lazy ACP runtimes, session persistence, approval queues, ACP `configOptions`, and a Codex-specific permission mode mapping. That shape worked while permission mode was the only known launch-sensitive dimension, but it does not scale to Codex fast mode, Codex reasoning effort, Claude Code effort and fast mode, OpenCode model variants, or future provider-specific settings.

ACP `configOptions` is still the correct session-time protocol surface when an agent advertises controls. The gap is everything that is not exposed through ACP, or that must be known before launching the ACP child process. WebUI needs a provider adapter layer that can normalize these differences without forcing every setting into the shared runtime manager.

## Goals / Non-Goals

**Goals:**

- Separate provider-specific launch mapping from shared ACP runtime behavior.
- Generalize permission mode into launch profiles that can include permission, speed, reasoning, model, and provider-specific startup settings.
- Keep ACP `configOptions` as the preferred session control source when an agent exposes model, reasoning, mode, speed, or other selectors.
- Persist enough launch profile metadata for routing, safety display, reloads, and session list summaries.
- Add a shared control model that the browser can render without hard-coding every provider parameter.
- Add prompt composer `$skill` autocomplete using backend-discovered skill metadata.
- Preserve current Codex and Claude behavior during migration.

**Non-Goals:**

- No generic in-app editor for every provider config file.
- No guarantee that Codex, Claude Code, OpenCode, or future providers expose equivalent controls.
- No runtime switching for launch-scoped controls on an existing session.
- No turn-scoped or per-prompt model parameter API in this change, though the control model should leave room for it.
- No implementation of provider authentication flows beyond surfacing existing launch or prompt errors.
- No attempt to standardize private provider transcript formats.

## Decisions

### Introduce provider adapters

Agent definitions should reference a provider adapter, such as `codex`, `claude`, `opencode`, or `generic-acp`. The shared runtime manager should own process lifecycle, ACP JSON-RPC, session maps, and update normalization, while provider adapters own command defaults, launch profile definitions, fallback controls, and config/env argument mapping.

Alternative considered: keep extending `AgentConfig::runtime_config_for_permission_mode`. That centralizes provider-specific behavior in shared config code and makes each new provider a cross-cutting edit.

### Replace permission-mode runtime identity with launch profiles

The runtime key should be derived from the agent id plus a canonical launch profile identity. A launch profile captures every setting that affects child-process compatibility. Codex `manual`, `full_auto`, and `yolo` can become predefined launch profiles; later Codex fast mode, Claude fast mode, Claude effort fallback, or OpenCode model variants can either extend profiles or create additional profiles.

```text
RuntimeKey = agent_id + launch_profile_hash

LaunchProfile
  id
  label
  controls
  command/env/args overrides from provider adapter
```

Alternative considered: add more dimensions to `AgentRuntimeKey`, such as `permission_mode`, `speed_mode`, and `reasoning_effort`. That becomes brittle as providers add unrelated knobs and does not handle provider-specific config blobs cleanly.

### Treat controls as scoped metadata

Controls should have explicit scope:

- `launch`: selected before session creation; persisted on session; affects runtime identity.
- `session`: available after ACP session creation; changed through `session/set_config_option` when supported.
- `turn`: reserved for settings that affect the next prompt only.
- `prompt`: reserved for text-level prompt affordances that are not true runtime parameters.

The first implementation should support `launch` and `session` controls. `turn` and `prompt` can be represented in types but hidden unless a future change defines behavior.

Alternative considered: expose all controls as normal form fields and let the backend reject unsupported transitions. That makes dangerous settings such as YOLO or fast mode look switchable after a session has already started.

### Prefer ACP config options over fallback mappings

If an ACP agent advertises a session control through `configOptions`, WebUI should render and update it through the existing ACP path. Provider fallback controls are for settings that are launch-scoped or not exposed by the adapter.

This means a Claude or OpenCode adapter that later exposes reasoning through ACP should automatically move that control into the session scope without requiring a new product concept.

Alternative considered: define WebUI-owned model, reasoning, and fast endpoints for every agent. That duplicates ACP and forces WebUI to understand provider semantics that agents already own.

### Persist launch profile snapshots

Sessions should persist the selected launch profile id and a compact snapshot of resolved launch controls. This is needed because provider definitions can evolve across app versions, but historical sessions still need to show whether they were created with YOLO, fast mode, high effort, or another important launch state.

The persisted profile should be display-safe and avoid machine-specific command paths, secrets, environment values, or local config file paths.

Alternative considered: recompute display metadata from current provider definitions every time. That can misrepresent old sessions after defaults or provider mappings change.

### Keep provider-specific mappings declarative where possible

Built-in adapters can be represented as Rust definitions initially, but the shape should make later config-file or plugin-driven providers possible. Provider mappings should describe launch controls, allowed values, risk level, and mapping outputs rather than requiring frontend changes.

Codex examples:

- Permission launch control maps to `approval_policy` and `sandbox_mode` `-c` overrides.
- Reasoning fallback maps to `model_reasoning_effort`.
- Fast fallback maps to `service_tier` and `features.fast_mode`.

Claude examples:

- Effort fallback maps to `--effort`, `CLAUDE_CODE_EFFORT_LEVEL`, or adapter-supported settings depending on the verified launch path.
- Fast mode fallback maps to Claude Code fast mode only when the adapter and selected model support it.

OpenCode examples:

- Model and reasoning profiles map to `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG`, model variants, or agent/provider options.

Alternative considered: shell out to each agent's native config commands before session creation. That risks mutating user-global config and makes rollback hard.

### Add backend skill discovery

Skill autocomplete should come from a backend discovery endpoint rather than browser filesystem access. The backend can scan known skill roots, parse `SKILL.md` frontmatter enough to return name, description, path/source, and enabled state, and keep the browser isolated from local path details unless a safe display label is needed.

Alternative considered: ask the ACP agent for skills. Skills are a Codex client concept today and may not be surfaced consistently through ACP agents. WebUI can still use the same local discovery rules for autocomplete without requiring agent support.

## Risks / Trade-offs

- [Risk] Launch profile hashing can become unstable if based on unordered JSON. -> Mitigation: canonicalize profile values before deriving runtime keys and persist explicit profile ids where possible.
- [Risk] Provider fallback mappings drift from upstream CLI behavior. -> Mitigation: keep mappings centralized by adapter, cover them with fake runtime tests, and prefer ACP-advertised controls when present.
- [Risk] Fast mode availability is model, account, and provider dependent. -> Mitigation: expose it only when the adapter can confidently advertise it, and surface agent errors without changing unrelated sessions.
- [Risk] Persisted profile snapshots may accidentally include local paths or secrets. -> Mitigation: store display metadata and normalized selected values, not resolved command/env details.
- [Risk] Generic controls can clutter the composer. -> Mitigation: group controls by scope and category, render only supported select controls initially, and keep advanced/provider-specific controls visually secondary.
- [Risk] Skill discovery across user directories may be expensive. -> Mitigation: cache results briefly and refresh on demand or on app-state reload.

## Migration Plan

1. Introduce provider adapter types and convert existing Codex and Claude definitions into adapter-backed catalog entries.
2. Add launch profile request/response models while preserving `permissionMode` as a compatibility field mapped into the default Codex launch profiles.
3. Persist launch profile id and display-safe selected launch control snapshot on sessions.
4. Change runtime manager keys from `(agent_id, permission_mode)` to `(agent_id, launch_profile_key)`.
5. Generalize frontend creation controls from permission mode buttons to launch-scoped controls grouped by agent.
6. Generalize Session Detail controls from `ModelSelector` to ACP-backed session controls, preserving model projection behavior.
7. Add skill discovery API and composer `$skill` autocomplete.
8. Update session list summaries to include launch profile and current session control metadata.
9. Add fake ACP coverage for Codex-like, Claude-like, and OpenCode-like configuration behavior.

Rollback should preserve existing sessions because compatibility fields can continue mapping to manual Codex behavior. If provider profiles are disabled, sessions with unsupported launch profiles should remain reviewable and become non-continuable with a clear reason.

## Open Questions

- Should launch profiles be entirely built-in for now, or should there be a minimal user config file for adding custom generic ACP agents in the same change?
- Should WebUI expose provider-specific controls in the same row as common controls, or place them behind an advanced disclosure?
- Should skill discovery include disabled skills so users understand why a `$skill` mention is unavailable, or only include invocable skills?
- Should fast mode be modeled as `category=speed` or a narrower `category=service_tier` in normalized controls?
