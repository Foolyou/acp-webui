## ADDED Requirements

### Requirement: Tool call timeline items expose display projection data
The backend SHALL expose enough structured tool call display data for clients to render concise activity rows without relying only on raw ACP payload inspection.

#### Scenario: Tool call display projection is available
- **WHEN** the backend can derive tool activity display data from a tool call record
- **THEN** the session timeline item SHALL expose display data that identifies the display kind, action label or verb, subject, status, and compact result where available
- **AND** existing raw input, raw output, tool kind, title, summary, and review artifact identifiers SHALL remain available for compatibility

#### Scenario: Display projection cannot be derived
- **WHEN** the backend cannot derive stable display data for a tool call
- **THEN** the session timeline item SHALL still include the existing raw and summary fields
- **AND** the browser SHALL have enough data to render a generic fallback row and diagnostics

#### Scenario: Projection is additive
- **WHEN** display projection fields are introduced to tool call timeline items
- **THEN** the fields SHALL be optional or backward-compatible for existing clients
- **AND** persisted raw tool call records SHALL not require destructive migration

### Requirement: Tool call timeline items expose evidence summaries
The backend SHALL identify tool-call-related evidence in the timeline response so the browser can render typed evidence actions.

#### Scenario: Tool call has review artifacts
- **WHEN** a tool call is linked to one or more review artifacts
- **THEN** the tool call timeline item SHALL expose evidence summary data or review artifact identifiers sufficient to render drill-down actions
- **AND** the evidence data SHALL distinguish terminal output, diff, Markdown, generic artifact, or unknown evidence when that kind is known

#### Scenario: Tool call has command output metadata
- **WHEN** command execution output, exit status, or duration metadata is available
- **THEN** the timeline item SHALL expose bounded output preview and result metadata suitable for concise rendering
- **AND** full output SHALL remain available through raw output or a review artifact when persisted

#### Scenario: Realtime tool call update changes evidence state
- **WHEN** a realtime tool call update adds output, failure, completion, or evidence links
- **THEN** the realtime timeline item upsert SHALL include enough updated display and evidence data for the browser to update the existing row in place
