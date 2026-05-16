## ADDED Requirements

### Requirement: Composer accepts pasted image attachments
The system SHALL allow supported image files pasted into the prompt composer to become prompt image attachments before submission.

#### Scenario: User pastes an image into the composer
- **WHEN** the user pastes a supported image file into an enabled composer for a session whose agent supports image prompts
- **THEN** the browser SHALL add the image to the composer attachments
- **AND** submitting the prompt SHALL send the image through the existing prompt content block pathway

#### Scenario: User pastes an unsupported image
- **WHEN** the user pastes a file whose MIME type or size is not supported by composer image attachments
- **THEN** the browser SHALL show a readable composer-level attachment error
- **AND** it SHALL preserve the current draft text and existing attachments

#### Scenario: Image prompts are unsupported
- **WHEN** the user pastes an image into a composer whose current agent connection does not support image prompts
- **THEN** the browser SHALL reject the image with a readable composer-level attachment error
- **AND** it SHALL NOT add the pasted image to the outgoing prompt

### Requirement: Composer accepts dropped image attachments
The system SHALL allow supported image files dropped onto the prompt composer to become prompt image attachments before submission.

#### Scenario: User drops an image on the composer
- **WHEN** the user drops a supported image file onto an enabled composer for a session whose agent supports image prompts
- **THEN** the browser SHALL add the image to the composer attachments
- **AND** the prompt draft and existing attachments SHALL remain available for editing before submission

#### Scenario: User drops unsupported files
- **WHEN** the user drops files that are not supported composer image attachments
- **THEN** the browser SHALL show a readable composer-level attachment error
- **AND** it SHALL preserve the current draft text and existing attachments

### Requirement: Composer previews attached images before sending
The system SHALL let users enlarge composer image attachments for inspection before submitting the prompt.

#### Scenario: User opens an attached image preview
- **WHEN** the user selects an image attachment thumbnail in the composer
- **THEN** the browser SHALL open a larger preview of that image
- **AND** the preview SHALL include enough context to identify the attachment

#### Scenario: User closes image preview
- **WHEN** the user closes an open composer image preview
- **THEN** the browser SHALL return to the same composer draft
- **AND** existing attachments SHALL remain attached unless the user explicitly removes them
