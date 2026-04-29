## Context

The React Session Detail view renders every persisted timeline item inside `.timeline`, with the prompt composer rendered after the timeline in the same session layout. Local performance investigation found that a long visible timeline can make typing in the composer take hundreds of milliseconds per character even when the input is replaced with an uncontrolled native textarea.

The largest observed regression came from the browser layout path rather than API calls or React state ownership. Hiding or removing `.timeline` restored normal typing speed, and changing `.timeline` away from CSS Grid to block or column flex layout also restored normal typing speed. CSS containment and `content-visibility` did not materially improve the measured input delay in this layout.

## Goals / Non-Goals

**Goals:**

- Keep prompt typing responsive when Session Detail displays a long persisted timeline.
- Preserve existing timeline ordering, message/tool/review rendering, sticky composer placement, and scroll-follow behavior.
- Add Playwright regression coverage that exercises typing into the composer with a large rendered timeline.
- Keep the change frontend-only and dependency-free.

**Non-Goals:**

- No virtualized timeline implementation.
- No lazy rendering, truncation, or deferred mounting for long Markdown or tool payloads.
- No backend API, persistence, ACP protocol, or data model changes.
- No visual redesign beyond the minimum layout adjustment needed for performance.

## Decisions

### Replace the timeline grid layout with a cheaper vertical layout

Use a block or column flex layout for `.timeline` while preserving the existing vertical spacing and width constraints. The current `display: grid` timeline forces the browser to keep a large list of Markdown, tool rows, notices, and review cards in an expensive grid layout path whenever the composer changes size or content.

Alternative considered: change the parent `.session-layout` grid to flex. That also improved measurements, but the smallest effective change is local to `.timeline` and avoids disturbing the toolbar/composer row model.

Alternative considered: move the composer to fixed positioning or a portal. That decouples typing from the timeline layout, but it increases risk around mobile keyboards, safe-area padding, scroll margins, and overlap with the return-to-bottom control.

### Keep the current rendered DOM instead of introducing virtualization

This change keeps all timeline items rendered and only changes the layout algorithm. The measured issue appears at roughly hundreds of timeline rows and is resolved by the layout change without adding a virtual list library.

Alternative considered: introduce a virtual list. Virtualization is still a valid later scaling strategy, but it adds complexity for dynamic Markdown heights, expanding tool details, review cards, bottom anchoring, and auto-follow behavior. It is outside the approved scope for this change.

### Cover the regression with a browser-level typing test

Add a Playwright test that loads or mocks a session with a large timeline, types into the prompt composer, and fails if keystroke latency regresses above a conservative threshold. The test should assert both responsiveness and that the composer remains usable with the long timeline visible.

Alternative considered: unit-test the CSS class. A unit test cannot catch browser layout regressions because the failure mode is main-thread layout work in Chromium, not React render output.

## Risks / Trade-offs

- Layout spacing can subtly change when replacing grid gap behavior -> Preserve the same item spacing with flex gap or equivalent margins and run existing visual/scroll behavior tests.
- Performance thresholds can be noisy in CI -> Use a conservative threshold that catches the hundreds-of-milliseconds regression without requiring sub-millisecond local results.
- Long-timeline fixture setup can make E2E slow -> Use mocked API responses or a focused fixture instead of generating a large session through many full backend prompt turns.
- Scroll-follow behavior could regress because the timeline end sentinel remains inside `.timeline` -> Run the existing auto-scroll Playwright coverage after the layout change.
