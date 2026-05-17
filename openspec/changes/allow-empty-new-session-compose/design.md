## Context

The frontend already creates the backend session before sending the optional compose prompt. The remaining blocker is the compose pane itself: it disables session creation while the prompt textarea is empty and shows copy saying the prompt is required.

## Goals / Non-Goals

**Goals:**
- Let users create a session from New Session compose with no prompt text.
- Continue sending a first prompt after creation when prompt text is present.
- Keep agent, permission mode, launch controls, last-profile behavior, and navigation unchanged.

**Non-Goals:**
- Change backend session creation or prompt APIs.
- Remove the prompt textarea, templates, or first-prompt shortcut behavior.
- Change follow-up prompt validation inside Session Detail.

## Decisions

- Treat prompt text as optional in New Session compose.
  - Rationale: the session can already be created empty, and users can send prompts from Session Detail after creation.
  - Alternative considered: keep the required prompt and add a separate "Create empty" action. That adds another primary path where a single create action can cover both cases.

- Keep submitting non-empty prompt text after session creation.
  - Rationale: users who type a first prompt should retain the convenient one-submit flow.
  - Alternative considered: always ignore compose prompt text and require sending from Session Detail. That would remove useful existing behavior.

## Risks / Trade-offs

- Users may create more empty sessions accidentally -> keep agent and launch controls visible before creation and preserve normal session management cleanup.
- Prompt template controls may appear useful even when no prompt is required -> acceptable because templates still help draft an optional first prompt.
