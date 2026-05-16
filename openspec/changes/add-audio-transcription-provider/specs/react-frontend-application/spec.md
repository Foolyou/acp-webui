## MODIFIED Requirements

### Requirement: React frontend verifies composer voice input behavior
The React frontend SHALL include automated coverage for server-backed voice transcription states and preserve existing prompt composer workflows.

#### Scenario: Voice transcription test inserts draft text
- **WHEN** frontend tests provide microphone recording support and mock a successful backend transcription response
- **AND** the simulated recording completes with transcript text
- **THEN** the tests SHALL verify that the transcript appears in the composer draft
- **AND** they SHALL verify that the prompt is not submitted until the existing submit action or shortcut is used

#### Scenario: Unconfigured voice transcription test preserves text composer
- **WHEN** frontend tests run with server-side transcription reported as unavailable
- **THEN** they SHALL verify that normal prompt typing and submission remain usable
- **AND** they SHALL verify that unavailable voice input does not create a broken interactive path

#### Scenario: Voice transcription failure test preserves draft
- **WHEN** frontend tests simulate microphone denial, recording failure, backend validation failure, or provider transcription failure
- **THEN** they SHALL verify that the composer leaves recording or transcribing state
- **AND** they SHALL verify that any existing prompt draft remains intact
- **AND** they SHALL verify that a recoverable composer-level error is visible

#### Scenario: Existing composer interactions still work
- **WHEN** frontend tests exercise voice transcription together with existing composer behavior
- **THEN** they SHALL verify that Ctrl+Enter/Cmd+Enter submission, multiline text entry, IME composition protection, skill autocomplete, prompt templates, image attachments, and queued prompt submission are not regressed where those features are available in the test fixture
