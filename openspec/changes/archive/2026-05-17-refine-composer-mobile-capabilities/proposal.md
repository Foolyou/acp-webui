## Why

The Session Detail composer has accumulated visible text-heavy controls as prompt attachments, voice input, templates, stop, and submission states were added. It should be more compact and icon-led across desktop and mobile, while preserving discoverability, accessibility, and the existing prompt workflows.

Mobile users also need the same supervision affordances available on desktop: a reachable fullscreen control and browser notification enablement from the mobile workbench chrome, without forcing them into settings or desktop-only controls.

## What Changes

- Refine the Session Detail composer into a compact action surface that keeps prompt input central and converts repeated button text to icon controls with accessible names and tooltips.
- Keep text labels only where they carry state or risk that an icon alone cannot communicate, such as destructive confirmation choices, disabled reasons, approval states, and validation errors.
- Ensure composer actions remain reachable and usable on mobile without increasing the sticky composer height or obscuring the timeline.
- Make fullscreen entry and exit reachable from mobile workbench chrome when supported.
- Make notification enablement reachable from mobile workbench chrome when supported and permission is not denied.
- Add frontend regression coverage for icon-led composer layout and mobile fullscreen or notification control reachability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-session-chat`: Require the Session Detail composer to use compact icon-led action controls while preserving existing prompt, attachment, voice, template, stop, queued, and disabled-state behavior.
- `session-workbench-navigation`: Clarify that mobile workbench chrome must expose fullscreen controls without conflict with navigation, status, or composer controls.
- `session-browser-notifications`: Require mobile notification enablement to be reachable from mobile workbench chrome when supported.
- `react-frontend-application`: Add frontend regression coverage for the compact composer and mobile fullscreen or notification reachability.

## Impact

- Frontend Session Detail composer layout, button labels, icons, tooltips, disabled states, and responsive behavior.
- Mobile workbench chrome actions for fullscreen and notification enablement.
- Playwright or equivalent frontend coverage for desktop and mobile layout regressions.
- No backend API contract changes are expected.
