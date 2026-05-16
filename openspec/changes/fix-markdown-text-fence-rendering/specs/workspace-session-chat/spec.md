## ADDED Requirements

### Requirement: Generic text-fenced assistant prose renders as readable Markdown
The browser SHALL render assistant message content wrapped entirely in a generic text fence as normal sanitized Markdown when the fenced body is prose or Markdown-like content.

#### Scenario: Assistant response is wrapped in a text fence
- **WHEN** the browser renders an assistant timeline message whose complete text content is wrapped in a `text`, `txt`, or `plaintext` fenced block
- **THEN** the browser SHALL render the fenced body through the normal Markdown renderer rather than showing the whole response as a preformatted code block
- **AND** Markdown headings, lists, emphasis, links, and inline code in the fenced body SHALL render as readable message content

#### Scenario: Assistant response contains a real code fence
- **WHEN** the browser renders an assistant timeline message containing a language-specific fenced block such as `json`, `ts`, `bash`, or `diff`
- **THEN** the browser SHALL preserve that block as preformatted code

#### Scenario: Assistant response mixes prose with generic text examples
- **WHEN** the browser renders an assistant timeline message that contains prose outside a generic text fenced block
- **THEN** the browser SHALL preserve the generic text fenced block as an intentional preformatted example
