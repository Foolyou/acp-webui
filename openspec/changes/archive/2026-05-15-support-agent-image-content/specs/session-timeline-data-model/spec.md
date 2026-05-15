## ADDED Requirements

### Requirement: Message timeline items expose structured content blocks
The system SHALL expose structured message content blocks for session timeline messages while preserving text fallback content for compatibility.

#### Scenario: Message contains structured text and image blocks
- **WHEN** a persisted user or assistant message contains structured content blocks
- **THEN** the session detail timeline item SHALL include those content blocks in their original order
- **AND** it SHALL continue to include a text `content` field containing the message's text fallback

#### Scenario: Legacy message has only text content
- **WHEN** a persisted message has no structured content blocks
- **THEN** the session detail timeline item SHALL remain renderable as a text-only message
- **AND** clients MAY treat the existing text content as a single text block

#### Scenario: Realtime message includes image content
- **WHEN** a realtime timeline message upsert includes image content blocks
- **THEN** the browser SHALL merge the item using the same normalized timeline identity as text messages
- **AND** it SHALL render the structured blocks without requiring a full session reload
