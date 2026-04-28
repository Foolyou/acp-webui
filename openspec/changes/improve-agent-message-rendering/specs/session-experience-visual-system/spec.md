## ADDED Requirements

### Requirement: Timeline message typography supports Markdown
The frontend SHALL style rendered Markdown in session timeline messages so structured Codex responses remain readable within chat bubbles and live streaming content.

#### Scenario: Message contains structured Markdown
- **WHEN** a session timeline message contains paragraphs, headings, lists, links, inline code, or fenced code blocks
- **THEN** the message bubble SHALL render those elements with compact chat-appropriate spacing and typography
- **AND** the rendered content SHALL stay within the message container on desktop and mobile viewports

#### Scenario: Message contains long code or links
- **WHEN** a rendered Markdown message contains long code, long links, or long unbroken text
- **THEN** the message bubble SHALL prevent horizontal page overflow
- **AND** code blocks SHALL remain inspectable without overlapping adjacent content

## MODIFIED Requirements

### Requirement: Tool calls render as compact expandable timeline rows
The frontend SHALL render tool call timeline items as compact Codex-like transcript rows by default.

#### Scenario: Tool call appears in timeline
- **WHEN** a tool call timeline item is available
- **THEN** the app SHALL render a thin row with an action label, subject, compact summary, and status
- **AND** the app SHALL avoid showing raw JSON by default

#### Scenario: Common tool call display data is available
- **WHEN** a tool call represents a recognizable command, file read, file edit, search, list, browser, or MCP-style operation
- **THEN** the app SHALL prefer a concise Codex-like action label and subject derived from the structured tool data
- **AND** unknown tool shapes SHALL fall back to the existing tool kind, title, summary, and status

#### Scenario: User expands tool call
- **WHEN** the user expands a tool call row
- **THEN** the app SHALL show available parameters, bounded output snippets, linked review artifacts if present, and explicit raw payload access
- **AND** raw input/output payloads SHALL remain hidden behind an inspection affordance until requested
