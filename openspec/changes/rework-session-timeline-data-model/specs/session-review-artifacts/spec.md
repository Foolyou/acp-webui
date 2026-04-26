## MODIFIED Requirements

### Requirement: Session review artifacts are persisted
The system SHALL persist review artifacts that belong to a session and link them to structured tool calls when available.

#### Scenario: Review artifact is created for a session
- **WHEN** the backend receives or derives review evidence for a known session
- **THEN** it SHALL persist a review artifact with a local id, session id, kind, title, summary, payload, source, and creation timestamp
- **AND** the artifact SHALL be available when loading that session after browser reload

#### Scenario: Review artifact is linked to a tool call
- **WHEN** review evidence includes a tool call id or can be associated with a structured tool call timeline item
- **THEN** the persisted artifact SHALL retain that tool call relation
- **AND** the session review UI SHALL be able to open the artifact from the related tool call row

### Requirement: Session review artifacts are listed for Session Detail
The system SHALL expose review artifact summaries as session-scoped drill-down evidence.

#### Scenario: Session has review artifacts
- **WHEN** the browser loads Session Detail for a session with review artifacts
- **THEN** the backend SHALL return artifact summaries or timeline references for that session
- **AND** each summary or reference SHALL include enough information to indicate drill-down evidence without loading the full payload

#### Scenario: Browser requests artifact detail
- **WHEN** the browser requests a specific review artifact for the current session
- **THEN** the backend SHALL return the artifact payload and metadata
- **AND** it SHALL reject access when the artifact does not belong to that session

### Requirement: Review artifacts update connected browsers
The system SHALL notify connected browsers when session review artifacts become available.

#### Scenario: Browser is viewing a session when an artifact is created
- **WHEN** the backend persists a review artifact for the current session
- **THEN** the browser SHALL receive a realtime timeline or review artifact event
- **AND** it SHALL add or update the corresponding timeline evidence affordance without polling

#### Scenario: Browser reconnects after artifact creation
- **WHEN** the browser reloads or reconnects after review artifacts were created
- **THEN** loading Session Detail SHALL restore the artifact summaries or timeline evidence references for that session
