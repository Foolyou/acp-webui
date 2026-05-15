## Why

Prompting from a keyboard is slow or awkward in several common situations: mobile use, hands-busy debugging, and longer exploratory prompts that are easier to speak than type. Adding voice input to the existing composer gives users a faster drafting path without changing the confirmed prompt submission flow.

## What Changes

- Add a compact voice input control to the Session Detail prompt composer when the browser can support microphone transcription.
- Let users start and stop dictation from the composer and insert recognized speech into the prompt draft.
- Keep text review explicit: voice input SHALL update the draft only, and users SHALL still submit with the existing send action or keyboard shortcut.
- Provide graceful fallback when speech recognition or microphone access is unavailable or denied.
- Preserve existing composer behavior for text entry, multiline editing, IME composition, skill autocomplete, prompt templates, image attachments, queued prompts, and compact responsive layout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-session-chat`: Add voice dictation as an alternate prompt drafting input for Session Detail.
- `session-experience-visual-system`: Add compact, accessible voice input states to the existing prompt composer controls.
- `react-frontend-application`: Add frontend coverage for voice input support, fallback, and non-regression of existing prompt submission behavior.

## Impact

- Frontend Session Detail composer state and controls.
- Browser speech recognition and microphone permission handling.
- Frontend styling and responsive layout for composer actions.
- Unit and/or browser automation tests for supported, unavailable, and failure states.
- No backend storage, ACP prompt API, database, or session timeline model changes are expected for the MVP.
