## Context

The React frontend currently uses one large app component with local `view` state for Inbox, Sessions, and Session Detail. Workspace creation, workspace selection, session creation, and chat live in one coupled pane. Modal overlays are custom-built and put close actions inside scrollable content. The visual system is functional but feels coarse, with large buttons, heavy borders, and weak feedback for slow Codex operations.

This change redesigns the app as a router-backed local Codex workbench. It depends on `rework-session-timeline-data-model` for normalized timeline items, structured tool calls, workspace-scoped session lists, and explicit view-only session metadata.

## Goals / Non-Goals

**Goals:**

- Replace ad hoc view state with TanStack Router and typed route params.
- Provide a desktop workbench shell with persistent navigation and a mobile full-screen navigation menu.
- Separate workspace list/create, session list/create, and session chat into routed surfaces.
- Adopt React Aria Components for accessible overlays and interaction primitives.
- Refresh the visual system using neutral tokens, compact statuses, and dark-mode-ready token names.
- Improve session creation, running, tool call, modal, and prompt composer feedback.
- Establish mobile baseline usability without fully polishing every mobile layout.

**Non-Goals:**

- Implementing dark mode in this change.
- Implementing ordinary running-turn cancellation.
- Implementing Codex resume.
- Introducing a full off-the-shelf visual system such as MUI, Ant Design, or Radix Themes.
- Building a right-side Activity panel in the first version.

## Decisions

1. Use TanStack Router for navigation.

   The app has natural route params for workspace and session ids, and future route search state can hold filters or selected panels. TanStack Router gives type-safe params and navigation while fitting the existing Vite + React + TypeScript setup.

   Alternative considered: React Router. It is widely used and simpler, but offers weaker type guarantees for route params and search state.

2. Keep a workbench layout on desktop and use full-screen navigation on mobile.

   Desktop should preserve efficient switching with persistent navigation. Mobile should not use a narrow literal sidebar; opening navigation should reveal a full-screen menu that contains workspaces, sessions for the current workspace, Inbox, and creation actions.

   Alternative considered: Strict page-by-page navigation on all viewports. That is simpler, but less efficient on desktop and less aligned with the intended Codex App-like workbench.

3. Use React Aria Components as behavior primitives with custom CSS.

   React Aria provides accessible dialogs, modal behavior, focus management, scroll locking, tabs, tooltips, and related interaction primitives while letting the project define its own visual language.

   Alternative considered: shadcn/ui. It has strong components, but it would likely introduce Tailwind and a larger component-source pattern. Radix Themes and MUI/Ant Design were rejected because their default visual systems are too opinionated for the desired restrained Codex-style UI.

4. Build token-first styling and defer dark mode.

   CSS should define semantic tokens for surface, text, border, accent, danger, success, focus, spacing, and radius. Dark-mode token slots can exist, but the app should ship only the light theme for this change.

   Alternative considered: Implement light and dark together. That expands QA and visual polish scope before the structure is stable.

5. Use optimistic chat shell for session creation.

   When the user creates a session, the UI should immediately show the chat shell with a skeleton and "Starting Codex..." status, then replace navigation to the real session detail once the backend returns a session id. Failures should show a retry path and not leave a fake session record.

   Alternative considered: Stay on the session list until creation completes. That is simpler but preserves the current perception that the app is stuck.

6. Keep running feedback always visible.

   Running state should appear both as a timeline-end live/skeleton item and as a compact status row above the composer. This avoids losing feedback when the user scrolls.

   Alternative considered: Only show a timeline item. That still disappears when scrolled away.

7. Render tool calls inline as compact expandable timeline rows.

   Tool calls should remain in chronological context with messages, defaulting to a thin summary row. Expanded content can show parameters, output snippets, raw payload, and artifact links.

   Alternative considered: Put tool calls only in a side Activity panel. That would be useful later, but it is more layout scope than this change needs.

## Risks / Trade-offs

- Router migration can break restore/deep link behavior -> Add route-level loading/error states and E2E coverage for workspace, session list, session detail, and Inbox navigation.
- New dependencies increase frontend surface area -> Limit additions to TanStack Router, React Aria Components, and any direct peer dependencies required by those libraries.
- Mobile full-screen nav can become crowded -> Keep it focused on navigation and creation actions, not full management workflows.
- Optimistic creation can desync from backend errors -> Do not create local fake sessions; treat the skeleton as transient UI until the backend returns a real id.
- Visual redesign may drift from existing behavior -> Keep behavior specs and Playwright flows as the acceptance target.

## Migration Plan

1. Add router and component primitive dependencies.
2. Introduce route structure and data-loading boundaries while preserving API client behavior.
3. Split the current app into app shell, navigation, workspace, session list, session detail, timeline, composer, approval, and review overlay components.
4. Replace custom overlays with React Aria-backed dialogs/sheets.
5. Introduce tokenized CSS and remove old one-off visual rules as components migrate.
6. Update Playwright tests for routed navigation, mobile baseline, loading states, and keyboard submission.
