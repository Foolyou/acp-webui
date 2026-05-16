## Context

The frontend already owns the workbench shell and shared navigation chrome. A
fullscreen affordance should remain client-side because the browser Fullscreen
API is user-gesture driven, permissionless after the gesture, and unavailable in
some embedded or restricted browser contexts.

## Goals / Non-Goals

**Goals:**
- Provide a clear fullscreen entry and exit control in the workbench shell.
- Reflect current fullscreen state when it changes through the button or browser
  controls.
- Avoid broken controls when the Fullscreen API is not available.
- Keep the experience responsive across desktop sidebar and mobile topbar.

**Non-Goals:**
- Persist fullscreen preference across page loads; browsers require a user
  gesture for entry.
- Create a custom in-page pseudo-fullscreen mode when the browser API is absent.
- Change backend session or agent runtime behavior.

## Decisions

- Use the browser Fullscreen API against `document.documentElement` rather than
  a nested workbench node. This keeps overlays, mobile navigation, and session
  surfaces inside the fullscreen region.
- Keep the state local to the fullscreen button and synchronize it from
  `fullscreenchange` / vendor-prefixed events. This avoids adding global app
  state for a browser-controlled condition.
- Render the control in existing desktop and mobile chrome. This preserves
  navigation density and avoids introducing a new settings panel.
- Hide the control when fullscreen is unsupported and disable it while support is
  still unknown. This avoids advertising an action that cannot work.

## Risks / Trade-offs

- Browser support differences -> use standard and WebKit-prefixed APIs.
- Fullscreen can fail due to browser policy -> catch errors and resync state
  instead of surfacing a persistent app error.
- A duplicated desktop/mobile control can drift -> keep behavior in one shared
  component and only render it in two shell locations.
