## MODIFIED Requirements

### Requirement: Tool calls render as compact expandable timeline rows
The frontend SHALL render ordinary tool call timeline items as compact Codex-like transcript rows by default, grouping consecutive ordinary tool calls into a single expandable activity row when appropriate.

#### Scenario: Single tool call appears in timeline
- **WHEN** one ordinary tool call timeline item appears without an adjacent ordinary tool call in the same consecutive run
- **THEN** the app SHALL render a thin transcript row with a concise action label and subject such as `Ran npm run build`
- **AND** the app SHALL avoid showing raw JSON by default
- **AND** the row SHALL expose only one expand/collapse affordance beyond the row summary

#### Scenario: Consecutive tool calls appear in timeline
- **WHEN** two or more ordinary tool call timeline items appear consecutively in the normalized timeline
- **THEN** the app SHALL render one collapsed grouped row summarizing the run, such as `Ran 4 commands`
- **AND** the app SHALL provide a single expand affordance that reveals each underlying ordinary tool call in timeline order

#### Scenario: Group contains mixed tool activity
- **WHEN** consecutive ordinary tool calls include multiple recognizable activity categories
- **THEN** the grouped row SHALL summarize the dominant categories with concise Codex-like labels
- **AND** unknown tool shapes SHALL fall back to generic tool labels without preventing the group from rendering

#### Scenario: Group contains failed tool activity
- **WHEN** any ordinary tool call in a grouped row has a failed status
- **THEN** the collapsed group summary SHALL expose that failure state or failure count
- **AND** expanding the group SHALL expose the failed tool's bounded readable detail text when available

#### Scenario: User expands tool call group
- **WHEN** the user expands a grouped tool activity row
- **THEN** the app SHALL show the individual ordinary tool calls with concise subjects, status, and readable plain-text details
- **AND** the expanded content SHALL NOT show raw JSON or additional output, diagnostics, or artifact action buttons

#### Scenario: Common tool call display data is available
- **WHEN** a tool call represents a recognizable command, file read, file edit, search, list, browser, or MCP-style operation
- **THEN** the app SHALL prefer a concise Codex-like action label and subject derived from the structured tool data
- **AND** unknown tool shapes SHALL fall back to the existing tool kind, title, summary, and status

### Requirement: Tool activity uses Codex-like compact transcript rows
The frontend SHALL render ordinary tool call timeline items as compact activity rows that prioritize action, subject, status, outcome, and readable expanded detail over raw payload structure.

#### Scenario: Tool activity row renders collapsed
- **WHEN** an ordinary tool call timeline item is available in Session Detail
- **THEN** the browser SHALL render a collapsed row with a user-facing action label, bounded subject, status, and compact result text
- **AND** the row SHALL not show raw JSON input or output by default
- **AND** the row SHALL not show secondary output, diagnostics, or artifact buttons

#### Scenario: Recognizable tool activity is classified
- **WHEN** a tool call represents command execution, file change, file read, search, browser activity, MCP activity, or another recognizable tool category
- **THEN** the browser SHALL render a category-appropriate label and subject derived from normalized display data or bounded payload parsing
- **AND** the row SHALL remain understandable without requiring the user to expand diagnostics

#### Scenario: Unknown tool activity falls back safely
- **WHEN** a tool call cannot be classified into a known display category
- **THEN** the browser SHALL render a generic tool activity row using the available tool kind, title, summary, and status
- **AND** expanding the row SHALL show bounded readable text instead of raw JSON

### Requirement: Tool activity rows are mobile-friendly
The frontend SHALL optimize ordinary tool activity rows for narrow mobile viewports without turning the session timeline into a wall of large cards.

#### Scenario: Long command or path appears on mobile
- **WHEN** a mobile-width viewport renders a tool activity row with a long command, path, URL, query, or MCP identifier
- **THEN** the row SHALL bound, wrap, clamp, or scroll only the affected inline value so the page does not overflow horizontally
- **AND** the status and single expand affordance SHALL remain visible and reachable

#### Scenario: Multiple tool activity rows appear in one turn
- **WHEN** a session turn contains several consecutive ordinary tool activity rows
- **THEN** the browser SHALL use compact spacing and restrained borders so the rows scan as transcript activity rather than repeated heavy cards
- **AND** chat messages, approval notices, and visual image blocks SHALL remain visually distinguishable from tool activity

#### Scenario: Tool activity row is expanded on mobile
- **WHEN** a mobile-width viewport renders expanded tool detail text
- **THEN** the readable detail text SHALL stay within the row bounds
- **AND** the row SHALL remain readable without requiring horizontal page scrolling

### Requirement: Tool activity diagnostics are explicit and secondary
The frontend SHALL keep raw tool input and output out of the primary timeline presentation while preserving readable diagnostic context in expanded tool detail text.

#### Scenario: User expands tool details
- **WHEN** the user activates the single expand affordance for a tool activity row
- **THEN** the browser SHALL show bounded readable text derived from the tool input, output, summary, or status
- **AND** the expanded timeline content SHALL not render raw JSON payloads

#### Scenario: Tool activity has large raw payloads
- **WHEN** raw input or output payloads are larger than the visible mobile viewport
- **THEN** the timeline SHALL use bounded readable excerpts instead of raw payload rendering
- **AND** the timeline SHALL avoid adding secondary diagnostics controls for those raw payloads
