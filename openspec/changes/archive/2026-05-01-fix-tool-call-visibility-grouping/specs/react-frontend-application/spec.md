## MODIFIED Requirements

### Requirement: React frontend renders completed tool call groups
The React frontend SHALL keep completed tool call history visible while reducing noise through collapsed consecutive groups.

#### Scenario: Consecutive completed tool calls render
- **WHEN** Session Detail contains consecutive completed tool call timeline items
- **THEN** the React frontend SHALL render a collapsed group that displays the number of completed tool calls
- **AND** it SHALL not omit the completed tool calls from the conversation history

#### Scenario: Completed tool group expands
- **WHEN** the user expands a completed tool call group
- **THEN** the React frontend SHALL show each grouped tool call detail in order
- **AND** the user SHALL be able to inspect the same details available from an ungrouped tool call row

#### Scenario: Sparse completed tool calls remain visible
- **WHEN** Session Detail contains completed tool call timeline items whose ACP payloads lack title or name metadata
- **THEN** the React frontend SHALL use fallback display data and keep those tool calls visible through the completed tool call group
- **AND** it SHALL not hide generic tool calls only because their title resembles permission request text

#### Scenario: Permission bookkeeping remains folded
- **WHEN** Session Detail contains explicit permission or approval bookkeeping tool call rows that duplicate visible approval state
- **THEN** the React frontend SHALL fold those bookkeeping rows out of the default conversation display
- **AND** it SHALL continue to render adjacent generic completed tool calls in collapsed groups
