## Why

The compose flow currently starts the first turn as part of session creation, which couples local session allocation with prompt dispatch. Creating the session first and then sending the prompt through the normal message path keeps first-turn behavior aligned with follow-up prompts, including prompt validation, timeline updates, and runtime dispatch.

## What Changes

- Change New Session compose submission to create an empty agent session before sending the entered prompt.
- Send the initial prompt through the existing prompt submission API after empty session creation succeeds.
- Keep the user-facing compose requirement that a prompt is entered before submitting the flow.
- Preserve session creation profile handling, navigation, and visible creation feedback.

## Capabilities

### New Capabilities

### Modified Capabilities
- `progressive-agent-session-start`: New Session compose still requires a prompt, but submission creates the session before dispatching the first prompt.
- `workspace-session-chat`: Session creation no longer starts a first prompt turn; the first prompt uses the normal prompt submission contract after the session exists.

## Impact

- Frontend New Session compose orchestration and route transition behavior.
- Frontend API tests and session creation flow tests.
- Backend behavior remains compatible because session creation already accepts an omitted initial prompt and prompt submission already handles idle sessions.
