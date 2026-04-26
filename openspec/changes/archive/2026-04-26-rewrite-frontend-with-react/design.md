## Context

The frontend currently uses Vite, TypeScript, and a single imperative DOM-rendering entrypoint. It already covers the core local Codex workflow: connection status, workspace creation, session creation, text prompts and replies, permission approval, Inbox updates, review artifact cards, and review drill-downs.

The rewrite should treat the existing frontend implementation as disposable. The backend API, WebSocket event shapes, SQLite persistence, ACP integration, and existing OpenSpec behavior requirements remain the contract that the new React frontend must satisfy.

## Goals / Non-Goals

**Goals:**

- Build a fresh React + TypeScript frontend under the existing `frontend/` Vite project.
- Preserve current browser behavior for workspace/session/chat, approval, Inbox, and review artifact flows.
- Make UI state explicit through React state, effects, and component composition instead of direct DOM replacement.
- Keep API and realtime integration isolated from presentational components so future UI work has stable boundaries.
- Update Playwright coverage so the React implementation proves parity for the existing end-to-end flows.

**Non-Goals:**

- Reusing old DOM-rendering code, helper functions, styles, or event-binding structure as an implementation foundation.
- Changing backend routes, WebSocket event payloads, ACP behavior, or SQLite schema.
- Adding new product scope such as multi-agent selection, remembered approval policies, terminal streaming, or normalized ACP Markdown/diff artifacts.
- Reworking visual design beyond what is necessary to produce a robust React implementation.

## Decisions

1. Use React with TypeScript inside the existing Vite frontend project.

   Rationale: Vite is already the frontend build tool, so adding React keeps the development and production serving model stable while introducing the component model needed for the growing UI. A separate framework would add routing and server-rendering concepts that are not needed for this local single-page application.

   Alternative considered: Keep vanilla TypeScript and split it into modules. That would reduce dependency changes but would still leave the UI lifecycle, state updates, and conditional rendering patterns custom-built.

2. Keep the app as a client-rendered single-page application with lightweight internal view state.

   Rationale: The backend currently serves a local API and static frontend bundle; the UI only needs Inbox and Session surfaces. Internal React state is sufficient for the current navigation model and avoids introducing a router until deep links or more pages exist.

   Alternative considered: Add React Router immediately. This is unnecessary for two top-level views and would create route semantics that the product has not specified yet.

3. Create a small API layer and realtime event reducer.

   Rationale: Fetch calls, response typing, WebSocket reconnect logic, and event application are shared behavior. Centralizing them prevents individual components from duplicating backend contract handling and makes parity testing more direct.

   Alternative considered: Fetch directly from each component. That is simpler at first but makes permission, Inbox, and session state synchronization harder to reason about.

4. Model the UI as feature-oriented components.

   Rationale: The main implementation should separate app shell/status, primary navigation, workspace picker/form, session timeline/composer, approval sheet, Inbox list, and review artifact overlay. These boundaries match the current workflows and keep future changes local.

   Alternative considered: A single large `App.tsx`. That would be quick but would recreate the maintainability problem in React form.

5. Preserve the backend contract and update tests around observable behavior.

   Rationale: This is a frontend rewrite, not an API migration. Existing Playwright flows should continue to validate the user-visible behavior through the backend and fake ACP process, with selector updates only where the new markup requires them.

   Alternative considered: Replace E2E with component tests first. Component tests can be added later, but they do not prove API/WebSocket parity for this rewrite.

## Risks / Trade-offs

- React dependency churn -> Keep dependency additions limited to React, React DOM, and required TypeScript/Vite React tooling.
- Realtime state regressions -> Implement WebSocket event handling as a pure reducer-style function where practical and cover permission, assistant message, and review artifact updates through E2E.
- UI parity gaps from rewriting without reuse -> Use existing OpenSpec specs, README scope, and Playwright flows as the acceptance checklist.
- Mobile layout regressions -> Keep the application mobile-first and verify form controls, sheets, and overlays at small viewport sizes.
- Overbuilding the state model -> Use local React state and custom hooks first; defer external state libraries until the app has more independent screens or caching needs.
