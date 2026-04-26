## 1. Project Setup

- [x] 1.1 Add React, React DOM, and Vite React plugin dependencies to `frontend/package.json` and refresh `package-lock.json`
- [x] 1.2 Update Vite and TypeScript configuration for React JSX compilation
- [x] 1.3 Replace the frontend entrypoint with a React mount that renders the new application root

## 2. API and Realtime State

- [x] 2.1 Define shared TypeScript models for app state, workspaces, sessions, messages, permission requests, review artifacts, and realtime events
- [x] 2.2 Implement a small API client for existing `/api/*` endpoints with consistent error handling
- [x] 2.3 Implement WebSocket connection, reconnect handling, and realtime event application for connection status, session status, text updates, permissions, and review artifacts
- [x] 2.4 Persist and restore selected workspace/session ids using browser storage without changing backend contracts

## 3. React UI Implementation

- [x] 3.1 Implement app shell, connection status indicators, and Inbox/Session navigation
- [x] 3.2 Implement workspace creation, workspace selection, and new Codex session creation
- [x] 3.3 Implement session timeline, live assistant text rendering, prompt composer, busy states, and disabled prompt behavior while running or waiting for approval
- [x] 3.4 Implement Inbox list behavior for sessions needing approval and navigation from Inbox to session detail
- [x] 3.5 Implement permission approval sheet with allow-once/reject-once submission, cancel handling, and disabled allow-always/reject-always options
- [x] 3.6 Implement review artifact cards and artifact detail overlay for diff, markdown, terminal, and raw payloads
- [x] 3.7 Implement mobile-first styling for the React component structure without reusing the old DOM-rendering implementation

## 4. Tests and Verification

- [x] 4.1 Update Playwright selectors only where the React markup requires it while preserving current workflow assertions
- [x] 4.2 Run `npm run build` in `frontend/` and fix TypeScript or bundling issues
- [x] 4.3 Build the backend binary and run `npm run e2e` in `frontend/` against the fake ACP process
- [x] 4.4 Manually smoke the Vite dev server with the backend when needed to verify layout and realtime UI behavior
