## ADDED Requirements

### Requirement: User can dictate prompt draft text
The browser SHALL allow the user to draft prompt text by voice in Session Detail when the composer is available and the browser supports speech recognition.

#### Scenario: Voice transcript is inserted into draft
- **WHEN** the user starts voice input from an enabled Session Detail composer
- **AND** speech recognition returns transcript text
- **THEN** the browser SHALL insert the transcript into the current prompt draft
- **AND** it SHALL keep the draft editable in the composer textarea
- **AND** it SHALL NOT submit the prompt solely because speech recognition returned text

#### Scenario: Voice transcript appends to existing draft
- **WHEN** the prompt composer already contains draft text
- **AND** speech recognition returns transcript text
- **THEN** the browser SHALL preserve the existing draft text
- **AND** it SHALL append or insert the transcript with readable whitespace rather than concatenating words together

#### Scenario: User submits dictated prompt
- **WHEN** the prompt draft contains dictated text
- **AND** the user activates the existing Send action or Ctrl+Enter/Cmd+Enter shortcut
- **THEN** the browser SHALL submit or queue the prompt through the existing prompt submission flow
- **AND** the backend SHALL receive the resulting prompt as normal text prompt content

#### Scenario: Voice input stops before submission
- **WHEN** the user stops voice input before submitting the prompt
- **THEN** the browser SHALL stop listening for additional transcript text
- **AND** it SHALL preserve any recognized draft text for review and editing

#### Scenario: Voice input is unavailable
- **WHEN** the browser does not support speech recognition or microphone access required for voice input
- **THEN** the browser SHALL keep normal text prompt entry usable
- **AND** it SHALL avoid presenting voice input as an action that can silently fail

#### Scenario: Voice input fails
- **WHEN** microphone permission is denied, speech recognition errors, or speech recognition ends unexpectedly
- **THEN** the browser SHALL leave voice input listening state
- **AND** it SHALL show a recoverable composer-level error without discarding the current prompt draft

#### Scenario: Composer cannot accept prompting
- **WHEN** the visible session is not continuable, requires restoration, or otherwise disables prompt drafting
- **THEN** the browser SHALL disable or hide voice input consistently with other prompt composer actions
- **AND** voice input SHALL NOT create or submit a prompt for that session
