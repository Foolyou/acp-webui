## ADDED Requirements

### Requirement: React frontend verifies composer voice input behavior
The React frontend SHALL include automated coverage for voice input states and preserve existing prompt composer workflows.

#### Scenario: Voice transcript test inserts draft text
- **WHEN** frontend tests provide a supported speech recognition implementation to the prompt composer
- **AND** the simulated recognition result emits transcript text
- **THEN** the tests SHALL verify that the transcript appears in the composer draft
- **AND** they SHALL verify that the prompt is not submitted until the existing submit action or shortcut is used

#### Scenario: Unsupported voice input test preserves text composer
- **WHEN** frontend tests run without browser speech recognition support
- **THEN** they SHALL verify that normal prompt typing and submission remain usable
- **AND** they SHALL verify that unavailable voice input does not create a broken interactive path

#### Scenario: Voice failure test preserves draft
- **WHEN** frontend tests simulate microphone denial or speech recognition failure
- **THEN** they SHALL verify that the composer leaves listening state
- **AND** they SHALL verify that any existing prompt draft remains intact
- **AND** they SHALL verify that a recoverable composer-level error is visible

#### Scenario: Existing composer interactions still work
- **WHEN** frontend tests exercise voice input together with existing composer behavior
- **THEN** they SHALL verify that Ctrl+Enter/Cmd+Enter submission, multiline text entry, IME composition protection, skill autocomplete, prompt templates, image attachments, and queued prompt submission are not regressed where those features are available in the test fixture
