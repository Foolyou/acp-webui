## Context

ACP Web UI already receives realtime events over its WebSocket connection. The
first notification version can therefore be browser-local: while the page is
open, the frontend can request Notification API permission and emit notifications
from existing realtime state transitions.

## Goals / Non-Goals

**Goals:**
- Let users explicitly enable browser notifications from the workbench UI.
- Notify on permission requests so users can return and approve or reject.
- Notify when a running turn completes so users know the agent is idle again.
- Keep behavior resilient when notifications are unsupported or denied.

**Non-Goals:**
- Push notifications when the web app is closed.
- Server-side subscription storage, service worker push, or mobile OS push.
- Notifications for every streamed message, tool call, queued prompt, or status
  update.
- Cross-device notification delivery.

## Decisions

- Use the standard browser Notification API directly from the frontend. This
  avoids backend state and matches the "page open in background" use case.
- Add a small notification service/helper that owns support detection,
  permission requests, and notification construction. This keeps browser globals
  testable and avoids scattering Notification API checks through realtime code.
- Trigger permission notifications from the `permission_requested` realtime
  event. The title should identify that approval is needed and the body should
  use the permission title when available.
- Trigger completion notifications from active-turn transitions that move a
  session from running/stopping to idle and clear the active turn. This avoids
  notifying on every assistant chunk and aligns with a completed turn.
- Do not persist the setting server-side. Browser permission state is already
  persisted by the browser; the UI can reflect granted/denied/default at runtime.

## Risks / Trade-offs

- Notification API support differs across browsers -> hide or disable enablement
  where unsupported and keep the app functional.
- Browser permission can be denied permanently -> show denied state without
  repeatedly prompting.
- Completion detection can duplicate if multiple events reconcile the same turn
  -> track the previous active turn in frontend state and only notify on a
  running-to-idle transition.
- Notifications can be noisy -> first version limits triggers to turn completion
  and permission requests only.
