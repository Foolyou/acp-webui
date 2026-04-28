## MODIFIED Requirements

### Requirement: Tool calls are persisted as structured timeline items
The system SHALL persist ACP tool activity as structured tool call records with enough data for concise timeline rendering and expanded inspection.

#### Scenario: Tool call starts
- **WHEN** the backend receives an ACP tool call update for a known session
- **THEN** it SHALL create or update a tool call timeline item with tool kind or name, compact summary, status, raw payload, timestamp, and display data that can identify the action and subject when available
- **AND** connected browsers SHALL be able to render the item without loading a review artifact payload

#### Scenario: Tool call updates
- **WHEN** the backend receives subsequent ACP updates for the same tool call id
- **THEN** it SHALL update the existing tool call timeline item instead of creating duplicate unrelated timeline items
- **AND** it SHALL preserve enough raw data and display data for expanded inspection and concise rendering

#### Scenario: Tool call produces review evidence
- **WHEN** a tool call produces diff, markdown, terminal output, or other review evidence
- **THEN** the backend SHALL link the review artifact to the related tool call when the relation is known
- **AND** the timeline item SHALL expose that drill-down evidence is available

#### Scenario: Tool call display data cannot be derived
- **WHEN** a tool call payload does not contain recognizable display data
- **THEN** the timeline item SHALL still expose the existing tool kind or name, title, summary, status, raw input, and raw output
- **AND** the browser SHALL be able to render a useful fallback row without failing
