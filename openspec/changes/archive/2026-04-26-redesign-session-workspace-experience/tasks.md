## 1. Dependencies and Routing Foundation

- [x] 1.1 Add TanStack Router and React Aria Components dependencies to the frontend package
- [x] 1.2 Define typed routes for Inbox, workspace list/create, workspace session list/create, and session detail
- [x] 1.3 Replace local `view` navigation state with route-driven navigation and route loading/error boundaries
- [x] 1.4 Update API client usage to consume workspace-scoped session lists and normalized session timeline data from `rework-session-timeline-data-model`

## 2. Workbench App Shell

- [x] 2.1 Implement desktop workbench shell with persistent navigation and active route state
- [x] 2.2 Implement mobile top bar and full-screen navigation layer with fixed close affordance
- [x] 2.3 Split workspace list/create, session list/create, and session chat into routed components
- [x] 2.4 Route Inbox items into the corresponding session detail while preserving approval context

## 3. Visual System and Component Primitives

- [x] 3.1 Introduce semantic CSS tokens for surfaces, text, borders, focus, status, actions, spacing, and radius with dark-mode-ready naming
- [x] 3.2 Restyle core app shell, navigation, lists, buttons, badges, notices, timeline items, and forms toward the restrained neutral visual direction
- [x] 3.3 Replace custom approval and review overlays with React Aria-backed dialog or sheet primitives
- [x] 3.4 Ensure overlay headers, close controls, and primary footer actions remain reachable while content scrolls

## 4. Session Interaction Improvements

- [x] 4.1 Implement optimistic chat shell and skeleton state while creating a new session
- [x] 4.2 Add creation failure handling with readable error and retry path without leaving fake session rows
- [x] 4.3 Add timeline-end running skeleton or live assistant item while a prompt turn is running
- [x] 4.4 Add compact status row above the composer for running and waiting-approval states
- [x] 4.5 Render structured tool calls as compact expandable timeline rows with raw payload access and artifact links
- [x] 4.6 Render non-continuable sessions as view-only with disabled composer and `viewOnlyReason`
- [x] 4.7 Add Ctrl+Enter and Cmd+Enter prompt submission while preserving Enter for multiline input and IME composition

## 5. Mobile Baseline

- [x] 5.1 Verify mobile navigation can reach Workspaces, Sessions, Inbox, session creation, and session detail
- [x] 5.2 Verify approval and review overlays are usable on mobile with fixed close controls
- [x] 5.3 Verify sticky composer and running status do not overlap essential content or safe-area padding

## 6. Tests and Verification

- [x] 6.1 Update Playwright tests for route-backed workspace/session navigation
- [x] 6.2 Add or update E2E coverage for session creation skeleton, running indicator, compact tool row behavior, and view-only session state
- [x] 6.3 Add or update E2E coverage for mobile full-screen navigation and overlay close behavior
- [x] 6.4 Add or update E2E coverage for Ctrl+Enter or Cmd+Enter prompt submission
- [x] 6.5 Run `npm run build` in `frontend/` and relevant Playwright checks
