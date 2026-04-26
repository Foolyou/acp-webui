## Why

The current browser UI is a single vanilla TypeScript entrypoint that is becoming hard to evolve as session chat, approvals, inbox projections, and review artifacts grow together. Rewriting the frontend in React creates a component and state model that can support the existing product surface without carrying forward the old implementation structure.

## What Changes

- Replace the current frontend implementation with a new React application built from scratch.
- Preserve the existing user-visible flows for workspace creation, session creation, chat, live assistant updates, permission approval, Inbox, and review artifacts.
- Keep the backend API and WebSocket event contract unchanged unless implementation discovers a small compatibility bug that should be fixed independently.
- Introduce React-oriented routing/view composition, component boundaries, and client state management for API data, WebSocket updates, forms, loading states, and errors.
- Update frontend package dependencies, TypeScript setup, Vite entrypoint, and tests to target the React application.
- **BREAKING**: Remove the old vanilla TypeScript DOM-rendering frontend instead of attempting incremental reuse.

## Capabilities

### New Capabilities

- `react-frontend-application`: Defines the React frontend application contract, including parity for existing browser workflows, realtime state updates, and build/test expectations.

### Modified Capabilities

None. Existing workspace session chat, permission approval, and Inbox requirements remain the behavioral parity target for the React implementation.

## Impact

- Affects `frontend/` source, package dependencies, TypeScript configuration, Vite configuration, Playwright tests, and generated frontend bundle output.
- Backend Rust APIs, SQLite schema, ACP process handling, and WebSocket event shapes are expected to remain stable.
- Existing browser E2E coverage must be updated or retained so the React rewrite proves parity for the current local Codex session workflow.
