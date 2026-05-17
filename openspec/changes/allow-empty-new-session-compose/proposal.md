## Why

New Session still requires users to type an initial prompt before creating a session. That blocks the intended workflow where users create an empty session first, inspect the session context, and send a prompt only when ready.

## What Changes

- Allow New Session compose to create a session with no initial prompt.
- Keep optional prompt text supported: when present, create the empty session first and then submit the prompt.
- Remove the empty-prompt disabled state and required-message copy from the compose screen.

## Capabilities

### New Capabilities

### Modified Capabilities
- `progressive-agent-session-start`: New Session compose no longer requires an initial prompt before session creation.
- `workspace-session-chat`: New-session compose can create an empty session without dispatching a prompt.

## Impact

- Frontend New Session compose validation and copy.
- Frontend compose tests and session creation orchestration tests.
- OpenSpec requirements for progressive session start and workspace session chat.
