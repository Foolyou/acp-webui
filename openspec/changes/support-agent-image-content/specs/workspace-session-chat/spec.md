## ADDED Requirements

### Requirement: Browser submits image prompt content
The system SHALL allow users to submit supported image content with a session prompt when the selected agent runtime supports ACP image prompt blocks.

#### Scenario: User sends text with images to an image-capable agent
- **WHEN** the user submits a non-empty text prompt with one or more supported image attachments to a continuable session whose owning runtime reports image prompt support
- **THEN** the backend SHALL persist the user message with ordered text and image content blocks
- **AND** it SHALL send the prompt to the ACP agent as ordered `ContentBlock` values including `type: "text"` and `type: "image"` blocks

#### Scenario: User sends images without text
- **WHEN** the user submits one or more supported image attachments without text to a continuable session whose owning runtime reports image prompt support
- **THEN** the backend SHALL accept the prompt
- **AND** it SHALL persist and send the image content blocks without requiring fallback text

#### Scenario: User attaches an unsupported image
- **WHEN** the user tries to submit an unsupported image MIME type or an image payload that exceeds configured limits
- **THEN** the backend SHALL reject the prompt with a readable validation error
- **AND** it SHALL NOT send the prompt to the ACP agent

#### Scenario: Runtime does not support image prompts
- **WHEN** the user tries to submit image attachments to a session whose owning runtime does not report image prompt support
- **THEN** the backend SHALL reject the prompt with a readable conflict error
- **AND** the browser SHALL keep text prompt submission available

### Requirement: Browser displays agent image content
The system SHALL display supported image content received from the selected ACP agent in the session timeline.

#### Scenario: Agent sends an image message chunk
- **WHEN** the selected agent sends supported image content for a session through `session/update`
- **THEN** the backend SHALL persist the assistant message with the image content block
- **AND** connected browsers SHALL render the image content in the timeline

#### Scenario: Agent sends mixed text and image content
- **WHEN** the selected agent sends text and supported image content for the same assistant message
- **THEN** the browser SHALL render both content types in message order
- **AND** the session history SHALL preserve enough structured content to render the same result after reload
