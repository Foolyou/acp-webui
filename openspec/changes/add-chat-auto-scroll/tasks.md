## 1. Timeline Scroll State

- [x] 1.1 Add bottom sentinel refs and auto-follow state to `SessionPane`.
- [x] 1.2 Detect bottom visibility with `IntersectionObserver` and restore auto-follow when the sentinel is visible.
- [x] 1.3 Detect user-initiated upward scrolling away from the bottom and pause auto-follow without reacting to programmatic scrolls.
- [x] 1.4 Scroll the sentinel into view on selected session changes, prompt submissions, running placeholders, live assistant text, and timeline item updates while auto-follow is active.

## 2. Return-To-Bottom UI

- [x] 2.1 Render an accessible `Scroll to bottom` shortcut only while auto-follow is paused and the newest content is below the viewport.
- [x] 2.2 Position and style the shortcut above the sticky composer on desktop and mobile without covering timeline content.
- [x] 2.3 Ensure the latest timeline item remains visible above the composer after returning to the bottom.

## 3. Verification

- [x] 3.1 Add Playwright coverage that an overflowing existing session opens at the newest timeline content.
- [x] 3.2 Add Playwright coverage that new messages and live assistant content auto-scroll while the user stays at the bottom.
- [x] 3.3 Add Playwright coverage that manual upward scrolling pauses auto-scroll and shows the return shortcut.
- [x] 3.4 Add Playwright coverage that activating the shortcut or manually scrolling to the bottom restores automatic following.
- [x] 3.5 Run `npm run build` and the relevant Playwright session flow tests.
