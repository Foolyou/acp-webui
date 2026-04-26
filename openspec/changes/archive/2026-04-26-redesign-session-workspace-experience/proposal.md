## Why

The current UI uses local view state as navigation, combines workspace creation, session lists, and chat in one surface, and provides weak feedback for slow Codex operations. Redesigning the session workspace experience will make the app feel like a coherent local Codex workbench across desktop and mobile while preserving the existing local workflow.

## What Changes

- Add TanStack Router and replace ad hoc `view` state with URL-backed workspace, session, inbox, and session detail routes.
- Redesign the app shell as a desktop workbench with persistent navigation and a mobile full-screen navigation menu rather than a button-like tab switcher.
- Adopt React Aria Components for accessible dialogs, sheets, overlays, popovers, tabs, tooltips, and related interaction primitives while keeping custom CSS and design tokens.
- Refresh the visual system toward a restrained Codex-inspired interface with neutral tokens, lighter controls, compact statuses, and dark-mode-ready token structure without implementing dark mode yet.
- Split workspace list/create, session list/create, and session chat into distinct routed surfaces while keeping desktop navigation efficient.
- Show an optimistic chat shell and skeleton while a new session is being created.
- Keep running state visible both at the timeline end and above the composer, without adding stop/cancel for ordinary running turns.
- Render tool calls as compact expandable timeline rows by default.
- Make approval and review overlays mobile-friendly with fixed close affordances and stable header/footer areas.
- Add desktop `Ctrl+Enter` / `Cmd+Enter` prompt submission with a lightweight composer hint.

## Capabilities

### New Capabilities

- `session-workbench-navigation`: Defines router-backed workbench navigation, desktop sidebar behavior, mobile full-screen navigation, and routed workspace/session surfaces.
- `session-experience-visual-system`: Defines the refreshed React UI foundation, design tokens, mobile overlay behavior, creation/loading feedback, running indicators, compact tool rows, and prompt composer keyboard behavior.

### Modified Capabilities

- `react-frontend-application`: The React app will use TanStack Router, React Aria Components, revised app shell structure, and updated build/test expectations.
- `workspace-session-chat`: Session creation, chat loading, prompt composer, running indicators, and view-only session presentation will change.
- `session-list`: The sessions surface will become workspace-scoped and routed, with creation entry points and loading states aligned to the workbench.
- `session-inbox`: Inbox navigation will route into the appropriate session detail while preserving approval context.
- `session-review-artifacts`: Review artifact drill-downs will use mobile-friendly overlays/sheets with fixed close controls.

## Impact

- Affects frontend routing, component structure, CSS architecture, package dependencies, API client integration, realtime state handling, and Playwright tests.
- Depends on `rework-session-timeline-data-model` for normalized timeline items, structured tool call rows, workspace-scoped session APIs, and session continuity metadata.
- Does not implement dark mode or ordinary running-turn cancellation in this change.
