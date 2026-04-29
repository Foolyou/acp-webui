## Context

ACP Web UI currently creates and restores ACP sessions, but only persists the ACP session id from `session/new` and ignores optional session configuration state returned by agents. The current browser flow can choose the owning agent for a new workspace session, but cannot show or change the model, mode, or reasoning selectors that ACP agents advertise through `configOptions`.

ACP `Session Config Options` is now the stable protocol surface for session-level selectors. A model selector is represented as a `select` option, usually with `category: "model"` and an agent-defined `id` and option values. Clients set values through `session/set_config_option`, and agents return the complete updated configuration state. Agents may also send `session/update` notifications with `sessionUpdate: "config_option_update"` when configuration changes without a direct client request.

This change crosses the ACP runtime, storage, API, realtime, and React UI. It also introduces a migration because existing persisted sessions do not have configuration snapshots.

## Goals / Non-Goals

**Goals:**

- Preserve and expose ACP `configOptions` for newly created and restored sessions.
- Let users switch the current model for a live idle session when the owning ACP agent advertises a model selector.
- Keep the browser synchronized when either the user or the agent changes configuration.
- Persist the complete configuration option snapshot and compact current-model metadata for reloads and session lists.
- Treat option values as opaque ACP agent identifiers.
- Avoid breaking existing sessions or agents that do not advertise configuration options.

**Non-Goals:**

- Creating sessions with a preselected model before `session/new` returns advertised options.
- Implementing a global default model preference per agent.
- Supporting unstable `session/set_model` as a compatibility fallback.
- Building a full generic settings panel for every possible future config option.
- Parsing provider, context window, thinking, or pricing metadata from model value strings.
- Allowing configuration changes while a prompt turn is running or waiting for approval.

## Decisions

### Use `configOptions` as the source of truth

The backend will store the complete `configOptions` array returned by ACP calls and notifications. The current model shown in list and detail views will be a derived projection from the first select option whose `category` is `model`, falling back to `id == "model"` only when no model category is present.

Alternatives considered:

- Store only `model_value` on the session. This loses dependent selectors and prevents correct UI updates when changing one option changes the full configuration state.
- Define an app-specific model registry. This would duplicate agent-owned model metadata and would not work for arbitrary ACP agents.

### Switch through stable `session/set_config_option`

The backend will expose a local API that maps to ACP `session/set_config_option` with the persisted ACP session id, requested config id, and selected value. The ACP response will replace the stored configuration snapshot and refresh the derived model projection.

Alternatives considered:

- Call unstable `session/set_model`. This is not part of the stable protocol and would add agent-specific branching before it is needed.
- Restart the agent process with a different model command argument. This would fragment sessions, lose per-session semantics, and require separate agent entries.

### Keep model values opaque

The UI will render each option's display name and description when present, but it will submit the exact `value` string received from the agent. The backend will not parse bracketed model parameters or infer providers.

Alternatives considered:

- Parse model value strings to show provider badges or reasoning settings. Current ACP agents can encode values differently, so parsing would be fragile and likely to break on new agents.

### Persist both raw snapshot and compact projection

Storage will add a JSON column for the full `configOptions` snapshot and compact nullable fields for current model option id, current model value, and current model name. API responses can return both the raw snapshot for detail controls and the compact projection for list rows.

Alternatives considered:

- Compute model metadata from JSON on every query. This is acceptable for detail responses but awkward for list projections and repeated session ordering or filtering work.
- Add a separate normalized table for every option and value. That is unnecessary for the first version because configuration state is owned by ACP agents and replaced as a complete snapshot.

### Restrict switching to live idle sessions

The first version will reject configuration changes for sessions that are not continuable, are running a prompt, or are waiting for approval. This avoids races with active turns and pending permission responders.

Alternatives considered:

- Allow switching during generation because ACP permits it. This creates ambiguous user expectations about whether the active turn or only future turns changes, and it complicates status recovery.

### Emit session-scoped realtime updates

When configuration changes, the backend will update storage and emit a realtime event containing the session id, full `configOptions`, and model projection. The current session view and visible session list rows will update without polling.

Alternatives considered:

- Require the browser to refetch session detail after every change. This is simpler but inconsistent with the app's existing realtime model for status, permissions, and review artifacts.

## Risks / Trade-offs

- Agent advertises malformed or unsupported option shapes -> Preserve raw JSON, ignore unsupported controls in the UI, and keep the session usable with the agent's default configuration.
- Agent returns a successful configuration response but later prompts fail for that model -> Surface the prompt failure normally; do not mark the model selector invalid unless the agent rejects the set request.
- Model option disappears after a dependent change -> Replace the full snapshot and clear compact model projection when no model selector remains.
- Existing sessions lack configuration snapshots -> Treat missing data as "no advertised configuration"; do not block review, restoration, or prompt submission.
- Switching during active work is not supported in the first version -> Disable the selector and return a conflict from the backend so the limitation is explicit.

## Migration Plan

1. Add nullable session columns for raw configuration options and compact current-model metadata.
2. Leave existing rows with null configuration fields.
3. Update new session and restore flows to persist configuration state when the ACP agent returns it.
4. Add the configuration update API and realtime event.
5. Update the browser to render model controls only when the current session has a model option.
6. Add fake ACP coverage for creation, switching, invalid switching, agent-driven updates, and reload/list projection.

Rollback is safe at the database level because the new columns are nullable and existing session behavior does not depend on them. If the UI or API path is disabled, sessions continue to use agent defaults and existing prompt flows remain available.

## Open Questions

- Whether a later version should remember a user's last selected model per agent and apply it immediately after `session/new`.
- Whether non-model config options such as `thought_level` should get first-class controls after the model selector is proven.
- Whether to support stable model switching during active prompt turns if user expectations and agent behavior become clearer.
