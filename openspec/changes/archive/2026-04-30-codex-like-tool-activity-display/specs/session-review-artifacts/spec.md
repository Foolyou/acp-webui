## ADDED Requirements

### Requirement: Tool activity rows expose typed evidence actions
The frontend SHALL expose review artifacts linked to tool calls as typed evidence actions from the corresponding tool activity row.

#### Scenario: Tool call has diff evidence
- **WHEN** a tool activity row is linked to diff evidence
- **THEN** the row SHALL provide a diff evidence action that opens the session-scoped diff review overlay
- **AND** the timeline SHALL continue to show only a compact summary rather than the full diff

#### Scenario: Tool call has Markdown evidence
- **WHEN** a tool activity row is linked to Markdown evidence
- **THEN** the row SHALL provide a Markdown evidence action that opens the sanitized Markdown review overlay
- **AND** the row SHALL not render unsafe Markdown or raw HTML directly in the timeline

#### Scenario: Tool call has terminal output evidence
- **WHEN** a tool activity row is linked to terminal output evidence
- **THEN** the row SHALL show at most a bounded output tail in the timeline
- **AND** it SHALL provide an evidence action that opens the full terminal output in a bounded review or diagnostics surface

#### Scenario: Tool call has generic artifact evidence
- **WHEN** a tool activity row is linked to evidence whose kind is unknown or generic
- **THEN** the row SHALL provide a generic artifact action with a concise label
- **AND** opening the action SHALL preserve the existing session-scoped review behavior

### Requirement: Failed tool activity surfaces actionable evidence
The frontend SHALL make failed tool activity understandable without requiring users to inspect raw payloads first.

#### Scenario: Command tool activity fails
- **WHEN** a command-like tool activity row has failed status
- **THEN** the row SHALL show failed state, bounded error or output tail when available, and an evidence or diagnostics action
- **AND** the full output SHALL remain available through terminal evidence, raw output, or diagnostics

#### Scenario: Failed tool activity appears on mobile
- **WHEN** a mobile-width viewport renders a failed tool activity row with output evidence
- **THEN** the visible error or output tail SHALL stay within the row bounds
- **AND** the row SHALL preserve access to evidence and diagnostics without overlapping the composer or adjacent timeline content
