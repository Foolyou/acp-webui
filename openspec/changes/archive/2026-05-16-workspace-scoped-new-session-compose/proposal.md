## Why

New Session is currently an agent/profile launch action that creates an empty session immediately. The mobile controller needs a workspace-scoped compose flow where remembered profile shortcuts preselect configuration and the session is created only after the user provides the initial prompt.

## What Changes

- Scope last session profile memory per workspace.
- Make New Session open a compose/configuration screen instead of creating an empty session.
- Offer Start last profile and Configure manually when a workspace has a remembered profile.
- Open manual configuration directly when no workspace profile exists.
- Save the confirmed agent, permission mode, model/config options, and launch controls as the workspace's last profile.
- Submit the initial prompt as part of session creation so empty sessions are not created by the shortcut alone.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `progressive-agent-session-start`: Session creation becomes workspace-scoped compose-first startup with per-workspace last profile memory.

## Impact

- Frontend New Session route and creation controls.
- Last profile local storage format.
- Backend create session API shape for optional initial prompt/content blocks.
- Frontend tests for profile scoping and create-after-prompt behavior.
