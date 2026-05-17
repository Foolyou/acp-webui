## Context

ACP Web UI already has canonical local permission modes (`manual`, `full_auto`, `yolo`) and uses them as creation-time session state. Codex maps these modes to runtime launch configuration, but Claude currently uses the generic agent configuration and only advertises `manual`.

The Claude ACP adapter exposes Claude Code permission mode as a session-scoped ACP configuration option named `mode`. Its values include `default` and, when supported by the adapter environment, `bypassPermissions`. That means Claude permission selection is not a child-process argument in ACP Web UI; it must be applied to the newly created ACP session before the first user prompt is submitted.

## Goals / Non-Goals

**Goals:**

- Let users create Claude sessions in `manual` or `yolo`.
- Keep `manual` as the default for Claude.
- Set Claude ACP `mode=default` or `mode=bypassPermissions` immediately after `session/new` and before initial prompt dispatch.
- Persist the local permission mode so Claude YOLO sessions receive the same durable warning treatment as Codex YOLO sessions.
- Fail session creation clearly when the Claude adapter does not advertise the requested ACP mode.

**Non-Goals:**

- No Claude `full_auto` support in this change.
- No direct `claude --permission-mode ...` CLI passthrough through `claude-acp-arg`.
- No runtime mutation of the persisted local permission mode for existing sessions.
- No new storage migration; the existing `permission_mode` column already stores the selected local mode.

## Decisions

### Model Claude permission support explicitly

Claude should no longer use the generic one-mode agent configuration. Add a Claude-specific provider configuration that advertises `manual` and `yolo`, with launch profiles that keep the same process args but persist distinct local permission-mode profile keys.

Alternative considered: keep Claude generic and rely only on ACP `mode` session controls. That allows bypass behavior after creation but hides the risk in the persisted local session state and does not cover initial prompts.

### Apply Claude mode through ACP config options

After `session/new` returns, inspect the returned `configOptions` for a select option with id `mode` and the mapped value. If the requested local mode is not already current, call `session/set_config_option` before storing the local session and before submitting the initial prompt. Persist the refreshed `configOptions` returned by the adapter.

Alternative considered: pass `permissionMode` through `_meta.claudeCode.options`. The current adapter controls `permissionMode` from Claude settings and marks direct meta `permissionMode` as managed by ACP, so config option mutation is the verified path available to ACP Web UI.

### Keep local mode immutable

Changing the Claude ACP `mode` control later should update session config options, but it should not silently rewrite the persisted local `permissionMode`. The local mode remains the creation-time safety label. This preserves the existing immutable permission-mode contract while still letting agent-advertised controls work.

Alternative considered: update local `permissionMode` whenever the ACP `mode` control changes. That would make a session's risk label mutable and conflict with existing session permission semantics.

## Risks / Trade-offs

- Claude adapter does not advertise `bypassPermissions` in some environments -> reject Claude YOLO creation with a readable error before any prompt is sent.
- ACP `mode` control values change in a future adapter version -> keep mapping centralized and test against fake ACP responses.
- In-session ACP mode changes can diverge from the local creation-time permission label -> rely on persisted config controls for exact current ACP value, and keep local YOLO warnings tied to creation-time selected risk.
- Separate Claude launch profiles may share identical process args -> acceptable because the profile is still used to persist local safety metadata and route sessions consistently.
