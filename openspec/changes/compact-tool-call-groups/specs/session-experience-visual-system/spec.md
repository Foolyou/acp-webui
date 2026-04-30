## MODIFIED Requirements

### Requirement: Tool calls render as compact expandable timeline rows
The frontend SHALL render tool call timeline items as compact Codex-like transcript rows by default, grouping consecutive tool calls into a single expandable activity row when appropriate.

#### Scenario: Single tool call appears in timeline
- **WHEN** one tool call timeline item appears without an adjacent tool call in the same consecutive run
- **THEN** the app SHALL render a thin transcript row with a concise action label and subject such as `Ran npm run build`
- **AND** the app SHALL avoid showing raw JSON by default

#### Scenario: Consecutive tool calls appear in timeline
- **WHEN** two or more tool call timeline items appear consecutively in the normalized timeline
- **THEN** the app SHALL render one collapsed grouped row summarizing the run, such as `Ran 4 commands`
- **AND** the app SHALL provide an expand affordance that reveals each underlying tool call in timeline order

#### Scenario: Group contains mixed tool activity
- **WHEN** consecutive tool calls include multiple recognizable activity categories
- **THEN** the grouped row SHALL summarize the dominant categories with concise Codex-like labels
- **AND** unknown tool shapes SHALL fall back to generic tool labels without preventing the group from rendering

#### Scenario: Group contains failed tool activity
- **WHEN** any tool call in a grouped row has a failed status
- **THEN** the collapsed group summary SHALL expose that failure state or failure count
- **AND** expanding the group SHALL expose the failed tool's bounded output or diagnostic access when available

#### Scenario: User expands tool call group
- **WHEN** the user expands a grouped tool activity row
- **THEN** the app SHALL show the individual tool calls with concise subjects, status, available output snippets, linked review artifacts if present, and explicit raw payload access
- **AND** raw input/output payloads SHALL remain hidden behind an inspection affordance until requested

#### Scenario: Common tool call display data is available
- **WHEN** a tool call represents a recognizable command, file read, file edit, search, list, browser, or MCP-style operation
- **THEN** the app SHALL prefer a concise Codex-like action label and subject derived from the structured tool data
- **AND** unknown tool shapes SHALL fall back to the existing tool kind, title, summary, and status
