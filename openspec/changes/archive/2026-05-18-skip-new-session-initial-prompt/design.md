## Context

New Session currently routes users through `NewSessionComposePane`, which combines launch profile selection with an optional first-prompt textarea and prompt-template controls. The backend and frontend already support creating an empty session first, and Session Detail already owns normal prompt drafting, templates, attachments, queueing, and submission.

The requested behavior is to create the session directly, then let users send any first prompt from Session Detail.

## Goals / Non-Goals

**Goals:**
- Remove the pre-session first-prompt step from New Session.
- Preserve agent selection, launch profile controls, last-profile memory, and creation loading feedback.
- Ensure New Session creates an empty backend session and never submits an initial prompt.
- Keep all first-prompt drafting and submission behavior in Session Detail.

**Non-Goals:**
- Change backend session creation or prompt API contracts.
- Remove prompt templates or prompt drafting from Session Detail.
- Change launch profile persistence or runtime selection semantics.

## Decisions

### Create directly from the selected launch profile

The New Session UI will submit creation as soon as a remembered profile is started or a manually selected launch profile is confirmed. This removes the intermediate first-prompt textarea while keeping the existing launch validation and creating-state route.

Alternative considered: keep the prompt field collapsed behind a toggle. That still preserves an unnecessary pre-session prompt path and keeps two places for first-message drafting.

### Keep prompt authoring in Session Detail only

Prompt templates, attachments, voice input, queueing, and validation already live in Session Detail. The New Session flow will not load prompt templates or accept prompt text; after creation, users use the normal composer for the first message.

Alternative considered: submit an initial prompt automatically after direct creation from a route parameter or stored draft. That adds hidden state and is outside the requested simplification.

### Simplify frontend creation plumbing without changing APIs

Frontend call sites will stop passing `initialPrompt` from New Session. The session creation helper can be reduced to the empty-session creation path, while `api.createSession` may keep its optional request fields for compatibility with older callers and backend tests.

Alternative considered: remove optional initial prompt support from the API wrapper and backend. That is broader than needed and could break compatibility with existing callers.

## Risks / Trade-offs

- Users who liked drafting before the session exists must now wait for Session Detail. Mitigation: Session Detail opens immediately after creation and retains the full composer surface.
- Existing tests and copy may still assume "compose" means first-prompt composition. Mitigation: update focused unit tests and OpenSpec wording to describe direct creation.
- Last Profile changes from opening a preselected compose screen to creating immediately. Mitigation: keep the manual configuration path available next to Start last profile.
