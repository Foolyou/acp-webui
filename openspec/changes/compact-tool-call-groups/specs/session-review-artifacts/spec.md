## MODIFIED Requirements

### Requirement: Session review artifacts are listed for Session Detail
The system SHALL expose review artifact summaries as session-scoped drill-down evidence while avoiding duplicate default timeline rows when an artifact is already reachable from a related tool activity row.

#### Scenario: Session has review artifacts
- **WHEN** the browser loads Session Detail for a session with review artifacts
- **THEN** the backend SHALL return artifact summaries or timeline references for that session
- **AND** each summary or reference SHALL include enough information to indicate drill-down evidence without loading the full payload

#### Scenario: Linked artifact is represented by tool evidence
- **WHEN** a review artifact is linked to a tool call that is rendered inside a visible tool activity row or group
- **THEN** the browser SHALL keep the artifact reachable from that tool activity evidence affordance
- **AND** it SHALL NOT require a separate default artifact card for the same evidence in the main transcript

#### Scenario: Orphan artifact has no visible tool activity
- **WHEN** a review artifact cannot be associated with a visible tool activity row or group
- **THEN** the browser SHALL render a compact standalone artifact fallback in the timeline
- **AND** selecting it SHALL open the existing session-scoped artifact drill-down

#### Scenario: Browser requests artifact detail
- **WHEN** the browser requests a specific review artifact for the current session
- **THEN** the backend SHALL return the artifact payload and metadata
- **AND** it SHALL reject access when the artifact does not belong to that session
