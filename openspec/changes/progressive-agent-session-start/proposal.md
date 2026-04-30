## Why

As more agent providers are added, showing every agent runtime status and every launch mode inline makes the workbench harder to scan and makes session creation grow with provider count. The UI needs a progressive flow that keeps global navigation compact while still exposing agent status and launch options when the user is intentionally choosing or troubleshooting an agent.

## What Changes

- Replace the sidebar's inline per-agent status stack with a compact entry point to an agent status page or panel.
- Add an agent status surface that shows all configured agents, runtime state, status message, enabled/unavailable state, and permission-mode status where relevant.
- Change New Session creation from a fully expanded matrix of agents and permission modes into a two-step flow:
  - first show a compact list of agents plus a Last Profile shortcut;
  - after selecting an agent, show that agent's available launch profile or permission-mode options for review and confirmation.
- Persist the most recently used session creation profile in the browser and offer it as a Last Profile shortcut when the workspace and agent state still allow it.
- Keep unavailable agents visible as selectable troubleshooting entries, but prevent confirmation until a valid launch option is selected.
- Preserve the existing backend session creation API shape; the frontend still submits `agentId` and `permissionMode` to the same endpoint.

## Capabilities

### New Capabilities
- `progressive-agent-session-start`: Covers compact agent status navigation, the agent status surface, progressive session creation, and the Last Profile shortcut.

### Modified Capabilities
- `react-frontend-application`: Session creation and per-agent runtime status presentation move from always-expanded inline controls to progressive selection and a dedicated status surface.
- `session-workbench-navigation`: Workbench navigation gains a route-backed or route-like agent status destination instead of showing all agent statuses directly in the sidebar.

## Impact

- Frontend routing/navigation components for the agent status entry point.
- Session list creation UI and local browser state for the last creation profile.
- Playwright coverage for agent status navigation, progressive agent selection, option confirmation, and Last Profile creation.
- No backend API or database changes are expected.
