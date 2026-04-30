## ADDED Requirements

### Requirement: Tool activity uses Codex-like compact transcript rows
The frontend SHALL render tool call timeline items as compact activity rows that prioritize action, subject, status, and outcome over raw payload structure.

#### Scenario: Tool activity row renders collapsed
- **WHEN** a tool call timeline item is available in Session Detail
- **THEN** the browser SHALL render a collapsed row with a user-facing action label, bounded subject, status, and compact result text
- **AND** the row SHALL not show raw JSON input or output by default

#### Scenario: Recognizable tool activity is classified
- **WHEN** a tool call represents command execution, file change, file read, search, browser activity, MCP activity, or another recognizable tool category
- **THEN** the browser SHALL render a category-appropriate label and subject derived from normalized display data or bounded payload parsing
- **AND** the row SHALL remain understandable without requiring the user to expand diagnostics

#### Scenario: Unknown tool activity falls back safely
- **WHEN** a tool call cannot be classified into a known display category
- **THEN** the browser SHALL render a generic tool activity row using the available tool kind, title, summary, and status
- **AND** diagnostics SHALL remain available for raw input and output inspection

### Requirement: Tool activity rows are mobile-friendly
The frontend SHALL optimize tool activity rows for narrow mobile viewports without turning the session timeline into a wall of large cards.

#### Scenario: Long command or path appears on mobile
- **WHEN** a mobile-width viewport renders a tool activity row with a long command, path, URL, query, or MCP identifier
- **THEN** the row SHALL bound, wrap, clamp, or scroll only the affected inline value so the page does not overflow horizontally
- **AND** the status and primary evidence actions SHALL remain visible and reachable

#### Scenario: Multiple tool activity rows appear in one turn
- **WHEN** a session turn contains several consecutive tool activity rows
- **THEN** the browser SHALL use compact spacing and restrained borders so the rows scan as transcript activity rather than repeated heavy cards
- **AND** chat messages, approval notices, and review evidence SHALL remain visually distinguishable from tool activity

#### Scenario: Tool activity row contains evidence actions on mobile
- **WHEN** a tool activity row has output, diff, Markdown, terminal, artifact, or diagnostics actions
- **THEN** the action controls SHALL wrap within the row, preserve touch-target usability, and avoid overlapping adjacent content
- **AND** the row SHALL remain readable without requiring horizontal page scrolling

### Requirement: Tool activity diagnostics are explicit and secondary
The frontend SHALL preserve raw tool input and output access through an explicit diagnostics affordance while keeping diagnostics secondary to the main transcript.

#### Scenario: User opens diagnostics
- **WHEN** the user activates diagnostics for a tool activity row
- **THEN** the browser SHALL show raw input and output payloads in a bounded inspection surface
- **AND** the user SHALL be able to return to the timeline without losing Session Detail context

#### Scenario: Tool activity has large raw payloads
- **WHEN** raw input or output payloads are larger than the visible mobile viewport
- **THEN** diagnostics SHALL be scrollable or otherwise bounded within the inspection surface
- **AND** close or collapse controls SHALL remain reachable
