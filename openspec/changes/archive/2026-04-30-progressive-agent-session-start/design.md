## Context

The current React workbench renders every agent runtime status in the sidebar and every agent launch option inside the session creation panel. That worked for Codex plus Claude, but it scales poorly when more agents and launch controls are configured. Session creation already has the data it needs on the client: `AgentRuntimeStatus`, permission modes, launch controls, and the existing `onCreate(agentId, permissionMode, launchControlValues)` callback.

## Goals / Non-Goals

**Goals:**
- Keep persistent navigation compact by replacing inline status stacks with a single Agents entry point.
- Add an agent status surface that can list all configured agents and their relevant runtime/permission-mode states.
- Make session creation progressive: choose agent first, then confirm launch details for that agent.
- Offer a browser-local Last Profile shortcut for the most recently confirmed agent and launch options.
- Preserve existing backend APIs and realtime status updates.

**Non-Goals:**
- No backend API, schema, or persisted profile changes.
- No cross-device profile sync.
- No redesign of session detail or prompt submission behavior.

## Decisions

- Use a route-backed Agents page rather than a sidebar popover. A route keeps the status surface shareable, testable, and consistent with Workspaces, Sessions, and Inbox. The mobile menu uses the same navigation entry.
- Store Last Profile in `localStorage` as `{ agentId, permissionMode, launchControlValues }`. This matches the existing session creation API and avoids introducing backend state. The shortcut is hidden or disabled when the stored agent is missing or its selected mode is unavailable.
- Keep unavailable agents in the first-step list. Users need to see failed or disabled agents for troubleshooting, but confirmation remains blocked when no valid launch mode can be selected.
- Use an inline confirmation panel inside the session list rather than a modal. It preserves current page context, avoids focus-trap complexity, and keeps creation scoped to the selected workspace.

## Risks / Trade-offs

- Browser-local Last Profile can become stale when agent configuration changes. Mitigation: validate it against the current agent list before enabling the shortcut and fall back to normal selection when invalid.
- A route-backed Agents page adds one more navigation destination. Mitigation: keep it compact and status-focused, with no session creation side effects.
- Two-step creation adds one click for first-time users. Mitigation: the Last Profile shortcut restores one-click creation for repeated workflows.
