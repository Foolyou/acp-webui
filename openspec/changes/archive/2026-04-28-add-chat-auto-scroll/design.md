## Context

The current React session detail view renders conversation items in `SessionPane.tsx` inside a `.timeline` element, followed by a sticky prompt composer. New persisted timeline entries, running skeletons, and live assistant text can appear below the viewport without automatically bringing the latest content into view.

This change is frontend-only. The backend already emits and persists the timeline data needed by the browser; the missing behavior is scroll state management in the session detail UI.

## Goals / Non-Goals

**Goals:**

- Keep the latest timeline content visible by default when a session loads, a prompt is submitted, live assistant text streams, or status/loading rows appear.
- Detect when the user intentionally scrolls away from the bottom and pause automatic following.
- Provide an accessible shortcut to return to the latest timeline content while auto-follow is paused.
- Restore automatic following once the bottom of the timeline is reached again.
- Keep the implementation local to the session detail frontend and covered by browser-level behavior tests.

**Non-Goals:**

- No backend API, persistence, or ACP protocol changes.
- No virtualized timeline rewrite.
- No cross-session persistence of the user's paused scroll state.
- No change to message ordering, timeline data normalization, or prompt submission rules.

## Decisions

### Track a bottom sentinel instead of measuring every message

Add a small sentinel element at the end of the rendered timeline and use it as the canonical "at bottom" marker. The auto-scroll effect should call `scrollIntoView` on that sentinel when auto-follow is active and timeline content changes.

Alternative considered: compute `scrollHeight - scrollTop - clientHeight` from a dedicated scroll container. The current layout scrolls with the page rather than a timeline-owned scroll pane, so a sentinel works with the existing document scroll model and avoids a layout rewrite.

### Keep auto-follow as explicit UI state

The session view should maintain an `autoFollow` state that starts enabled for each opened session. User-initiated upward scrolling while the sentinel is not visible disables auto-follow. When the sentinel becomes visible again, auto-follow is re-enabled.

Alternative considered: always infer auto-follow from the sentinel visibility alone. That can misclassify the brief moment after new content is appended, where the sentinel may leave view before the auto-scroll effect runs. Explicit state lets programmatic scrolling and user scrolling be handled differently.

### Use viewport-aware observation and requestAnimationFrame scheduling

Use `IntersectionObserver` on the bottom sentinel to detect whether the timeline end is visible or near visible. Schedule scroll-to-bottom work in `requestAnimationFrame` when `currentSession.timeline`, `liveAssistant`, running/loading state, or the selected session id changes.

Alternative considered: run `scrollIntoView` synchronously in every render effect. That is simpler but can create jank during streaming text updates and can fight React layout updates.

### Keep the shortcut button near the composer

Render a compact `Scroll to bottom` button only when auto-follow is paused and newer content is below the viewport. Position it above the sticky composer within the session layout so it stays reachable on desktop and mobile without covering message text. The button should use existing button styling and focus states.

Alternative considered: show a permanent floating action. A permanent control adds noise when the timeline is already following correctly; conditional display maps directly to the paused state.

## Risks / Trade-offs

- Streaming assistant text can update frequently -> Throttle scroll work through one animation frame and depend on content state rather than raw stream events.
- Programmatic scrolling can be mistaken for user scrolling -> Track recent programmatic scroll requests and only pause on user scroll input or upward movement outside that window.
- The sticky composer can obscure the final sentinel -> Give the sentinel or timeline end enough scroll margin/padding to keep the latest item visible above the composer.
- Browser layout differs between mobile and desktop -> Cover both viewport sizes in Playwright checks for button visibility and return-to-bottom behavior.
