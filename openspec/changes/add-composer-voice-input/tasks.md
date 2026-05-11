## 1. Voice Recognition Adapter

- [x] 1.1 Add a frontend speech recognition adapter that detects `SpeechRecognition` / `webkitSpeechRecognition` support without throwing in unsupported browsers or tests
- [x] 1.2 Normalize recognition lifecycle events into supported, listening, transcript, end, and error states that the composer can consume
- [x] 1.3 Add whitespace-aware transcript insertion helpers for empty drafts, existing drafts, and multiline drafts

## 2. Composer Integration

- [x] 2.1 Integrate voice input state into `PromptComposer` without changing the existing prompt submission API
- [x] 2.2 Add a compact voice input control that starts and stops listening and updates its accessible label by state
- [x] 2.3 Insert recognized transcript text into the editable prompt draft without auto-submitting it
- [x] 2.4 Disable or hide voice input when speech recognition is unsupported or when the composer cannot accept prompt drafting
- [x] 2.5 Surface microphone denial, recognition errors, and unexpected end states as recoverable composer-level errors while preserving the draft

## 3. Layout And Accessibility

- [x] 3.1 Style the voice control and listening state within the existing compact composer action row
- [x] 3.2 Verify desktop and mobile composer layouts avoid overflow, overlap, or excessive persistent height
- [x] 3.3 Ensure voice input state does not interfere with textarea focus, skill autocomplete, prompt templates, image attachments, or the Send action

## 4. Tests

- [x] 4.1 Add unit tests for speech recognition support detection, lifecycle normalization, and transcript insertion helpers
- [x] 4.2 Add composer tests for transcript insertion, explicit submission, stop behavior, unsupported state, and recoverable errors
- [x] 4.3 Add regression coverage for existing composer behavior: Ctrl/Cmd+Enter submission, multiline entry, IME composition protection, skill autocomplete, templates, image attachments, and queued prompts where fixtures support them
- [x] 4.4 Add or update browser layout coverage for voice control behavior on desktop and mobile viewports

## 5. Verification

- [x] 5.1 Run the frontend unit test suite
- [x] 5.2 Run frontend lint and build checks
- [x] 5.3 Run relevant Playwright coverage or document any unavailable browser automation prerequisites
- [x] 5.4 Run OpenSpec validation for `add-composer-voice-input`
