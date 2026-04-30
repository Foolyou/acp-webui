## Why

The sidebar currently exposes a standalone Sessions entry even though sessions are already scoped to the active workspace. This duplicates navigation concepts and makes the workbench feel more complex as more workspace and agent surfaces are added.

## What Changes

- Remove the standalone Sessions entry from desktop sidebar and mobile navigation.
- Keep workspace-scoped session lists reachable by selecting a workspace.
- Add a clear return mechanism from Session Detail back to the current workspace's session list.
- Preserve deep links to workspace session lists and individual session detail routes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-workbench-navigation`: Update navigation requirements so Sessions is not a primary sidebar entry, workspace selection is the primary path to a workspace session list, and Session Detail provides a quick return to that workspace list.

## Impact

- Frontend route navigation, sidebar/mobile menu rendering, and active navigation state.
- Session Detail header or nearby navigation affordance.
- Browser automation coverage for workspace-to-sessions navigation and session-detail return navigation.
