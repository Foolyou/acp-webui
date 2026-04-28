## ADDED Requirements

### Requirement: Session timeline renders Markdown message content
The system SHALL render session message content as sanitized Markdown in the session timeline while preserving the original raw text content in backend storage and API responses.

#### Scenario: Markdown text response is received
- **WHEN** Codex sends text response content containing Markdown structure
- **THEN** the backend SHALL forward and persist the raw text content without stripping Markdown syntax
- **AND** the browser SHALL render headings, lists, code, links, and inline formatting as Markdown in the assistant timeline message

#### Scenario: Markdown response streams
- **WHEN** live assistant text is arriving for a running prompt turn
- **THEN** the browser SHALL update the live assistant message through the Markdown-aware renderer
- **AND** incomplete Markdown SHALL not break the timeline layout or prevent subsequent text from rendering

#### Scenario: User prompt contains Markdown
- **WHEN** the user submits a prompt containing Markdown syntax
- **THEN** the browser SHALL show the submitted prompt in the timeline with the same Markdown safety constraints used for assistant messages
- **AND** the backend SHALL send the original prompt text to Codex unchanged

#### Scenario: Unsafe Markdown content is present
- **WHEN** a session message contains raw HTML, scripts, or unsupported Markdown content
- **THEN** the browser SHALL NOT execute unsafe content
- **AND** the readable text content SHALL remain visible when possible
