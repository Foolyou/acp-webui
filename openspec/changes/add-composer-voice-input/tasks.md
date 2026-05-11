## 1. Voice Recognition Adapter

- [ ] 1.1 Add a frontend speech recognition adapter that detects `SpeechRecognition` / `webkitSpeechRecognition` support without throwing in unsupported browsers or tests
- [ ] 1.2 Normalize recognition lifecycle events into supported, listening, transcript, end, and error states that the composer can consume
- [ ] 1.3 Add whitespace-aware transcript insertion helpers for empty drafts, existing drafts, and multiline drafts

## 2. Composer Integration

- [ ] 2.1 Integrate voice input state into `PromptComposer` without changing the existing prompt submission API
- [ ] 2.2 Add a compact voice input control that starts and stops listening and updates its accessible label by state
- [ ] 2.3 Insert recognized transcript text into the editable prompt draft without auto-submitting it
- [ ] 2.4 Disable or hide voice input when speech recognition is unsupported or when the composer cannot accept prompt drafting
- [ ] 2.5 Surface microphone denial, recognition errors, and unexpected end states as recoverable composer-level errors while preserving the draft

## 3. Layout And Accessibility

- [ ] 3.1 Style the voice control and listening state within the existing compact composer action row
- [ ] 3.2 Verify desktop and mobile composer layouts avoid overflow, overlap, or excessive persistent height
- [ ] 3.3 Ensure voice input state does not interfere with textarea focus, skill autocomplete, prompt templates, image attachments, or the Send action

## 4. Tests

- [ ] 4.1 Add unit tests for speech recognition support detection, lifecycle normalization, and transcript insertion helpers
- [ ] 4.2 Add composer tests for transcript insertion, explicit submission, stop behavior, unsupported state, and recoverable errors
- [ ] 4.3 Add regression coverage for existing composer behavior: Ctrl/Cmd+Enter submission, multiline entry, IME composition protection, skill autocomplete, templates, image attachments, and queued prompts where fixtures support them
- [ ] 4.4 Add or update browser layout coverage for voice control behavior on desktop and mobile viewports

## 5. Verification

- [ ] 5.1 Run the frontend unit test suite
- [ ] 5.2 Run frontend lint and build checks
- [ ] 5.3 Run relevant Playwright coverage or document any unavailable browser automation prerequisites
- [ ] 5.4 Run OpenSpec validation for `add-composer-voice-input`
