## Context

Session Detail already centralizes prompt drafting in the React `PromptComposer`: it owns the draft text, submission shortcut, templates, skill autocomplete, and image attachments before passing the final prompt through the existing send flow. Voice input can therefore be modeled as another draft producer instead of a new message type or backend pathway.

Browser speech recognition support varies by engine and runtime context, and microphone access is permission-gated. The design must treat voice input as an optional enhancement while preserving keyboard-first prompting.

## Goals / Non-Goals

**Goals:**

- Add voice dictation to the existing Session Detail composer without changing prompt submission semantics.
- Keep users in control by inserting recognized text into the draft rather than auto-submitting it.
- Degrade cleanly when browser speech recognition, secure-context microphone access, or permissions are unavailable.
- Preserve composer compactness, accessibility, IME behavior, autocomplete behavior, and queued prompt behavior.
- Keep implementation frontend-only for the MVP.

**Non-Goals:**

- Server-side speech-to-text, audio upload, transcript persistence, or audio attachment support.
- Automatic prompt submission after speech recognition.
- Agent/runtime-specific audio prompt capabilities.
- Custom language selection or transcript editing beyond the existing textarea.

## Decisions

1. Use browser-native speech recognition when available.

   The MVP should wrap `SpeechRecognition` / `webkitSpeechRecognition` behind a small frontend adapter and expose only the states the composer needs: unsupported, idle, listening, stopping, and error. This avoids adding backend dependencies and keeps recognized text in the same draft path as typed text.

   Alternative considered: record microphone audio with `getUserMedia` and send it to a backend transcription service. That would improve cross-browser consistency but introduces API design, privacy, audio lifecycle, cost, and deployment concerns that are disproportionate for the first version.

2. Treat transcripts as draft text, not submitted prompts.

   Recognition results should append to the current prompt at the current draft boundary using whitespace-aware joining. Users can review, edit, combine with templates or skill mentions, and submit through the existing button or Ctrl/Cmd+Enter shortcut.

   Alternative considered: auto-submit when speech recognition ends. That is faster for command-style interactions but too risky for a coding agent because recognition errors can trigger unintended tool use.

3. Render voice input as a compact composer action.

   The control should live with the existing composer actions and use an icon-style affordance with accessible labels. Listening state should be visible without expanding the composer into a status panel. Errors should use the existing non-blocking composer error pattern.

   Alternative considered: a larger recording panel with live transcript preview. That may be useful later, but it competes with timeline space and conflicts with the current compact composer contract.

4. Make availability dynamic and non-blocking.

   If speech recognition is unavailable, the composer should remain fully usable. The implementation can hide the control or disable it with an accessible explanation; tests should lock in whichever UI choice is selected during implementation. Permission denial or recognition failure should stop listening and show a short recoverable error.

5. Preserve existing input edge cases.

   Voice input must not submit during IME composition, must not capture skill autocomplete keys, must not remove image attachments or prompt template text, and must honor disabled composer states for non-continuable sessions. If the session is running but the composer can queue prompts, dictation should still draft text for that queued prompt path.

## Risks / Trade-offs

- Browser support is inconsistent -> Keep the feature optional and covered by unsupported-state tests.
- Recognition can produce inaccurate text -> Insert into the draft only and require explicit user submission.
- Permission prompts can fail or be dismissed -> Handle denial as a recoverable composer error and return to idle.
- Native recognition events are hard to test in jsdom/Playwright -> Isolate API access behind an adapter or injection point so tests can simulate events deterministically.
- Composer action density may regress on mobile -> Add responsive layout coverage and keep the control icon-sized.

## Migration Plan

No data migration is required. The change can ship as a frontend enhancement. Rolling back removes the voice control and adapter while leaving prompt submission, stored messages, queued prompts, and backend APIs unchanged.
