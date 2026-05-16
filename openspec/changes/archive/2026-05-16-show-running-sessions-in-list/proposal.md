## Why

Users need to distinguish sessions that are actively running from sessions that are idle when scanning the Sessions list. The current row metadata includes status text, but it is visually mixed with agent and timestamp metadata and is easy to miss.

## What Changes

- Add an explicit running-state indicator to session list rows.
- Show compact labels for running, stopping, and waiting-for-approval sessions.
- Keep idle sessions visually quiet by omitting an active-state badge.
- Preserve existing realtime list updates and backend API shape.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-list`: Session rows highlight active running states in scan-friendly list metadata.

## Impact

- Frontend Sessions list row rendering and styling.
- Frontend tests for active and idle session list rows.
- No backend API, storage migration, or dependency changes.
