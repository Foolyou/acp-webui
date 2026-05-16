## Why

ACP Web UI is often used on small or shared displays where browser chrome and
surrounding UI reduce the usable session area. Users need an explicit fullscreen
mode that makes the workbench feel like a focused, app-like surface.

## What Changes

- Add a first-class fullscreen mode control to the workbench shell.
- Keep fullscreen state visible through the control while the browser is in or
  out of fullscreen.
- Make the control usable from both desktop and mobile workbench chrome.
- Gracefully hide or disable the control when the browser does not expose the
  Fullscreen API.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-workbench-navigation`: Define the fullscreen workbench control and
  its responsive behavior.

## Impact

- Frontend shell and shared fullscreen control behavior.
- Frontend tests for fullscreen affordance state and unsupported browser
  handling.
- No backend API, storage, or protocol changes.
