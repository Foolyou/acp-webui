## Context

The New Session compose screen currently requires prompt text, then passes that prompt into `api.createSession`. The backend still supports session creation without `initialPrompt`, and the existing Session Detail composer already sends prompts through `api.prompt` with the same validation, persistence, dispatch, and reconciliation path used for follow-up prompts.

This change keeps the compose screen as the user's first-prompt entry point, but separates local session creation from prompt dispatch. The first user prompt should behave like any other prompt sent to an idle continuable session.

## Goals / Non-Goals

**Goals:**
- Create the selected workspace session without `initialPrompt` or initial content blocks in the session creation request.
- Submit the compose prompt to the newly created session through the existing prompt API after session creation succeeds.
- Preserve navigation, optimistic creation feedback, stored last-profile behavior, and session list updates.
- Cover the request ordering with focused frontend tests.

**Non-Goals:**
- Remove backend compatibility for clients that still send `initialPrompt` during session creation.
- Change prompt queueing, approval blocking, or image content block semantics.
- Redesign the New Session compose UI.

## Decisions

- Use the existing prompt endpoint for the first compose prompt after session creation.
  - Rationale: it reuses the same prompt validation, persistence, active-turn tracking, realtime updates, and detail reconciliation path used by normal prompts.
  - Alternative considered: move the split into the backend create-session handler. That would keep the frontend API call unchanged but would not give the frontend an actual empty-session creation boundary.

- Keep the frontend `createSession` action signature with optional prompt and content blocks.
  - Rationale: route components and tests already use this shape, and the action can remain the orchestration point that creates the empty session and then dispatches the optional prompt.
  - Alternative considered: add a separate `createSessionThenPrompt` action. That adds surface area without a distinct caller need.

- Preserve backend `initialPrompt` compatibility.
  - Rationale: existing clients or tests may rely on the API accepting an initial prompt, and removing it is not required for the requested frontend behavior.
  - Alternative considered: reject `initialPrompt` server-side. That would be a breaking API change outside this request.

## Risks / Trade-offs

- Prompt dispatch can fail after the empty session is created -> keep the newly created session visible and surface the prompt error so the user can retry from Session Detail.
- Realtime events may update the new session while the immediate prompt response is still in flight -> continue using the existing detail reconciliation after prompt submission.
- The flow performs two HTTP requests instead of one -> acceptable because it reduces behavioral branching and uses already-supported APIs.
