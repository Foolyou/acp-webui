## ADDED Requirements

### Requirement: Image artifacts can be reviewed
The system SHALL persist and expose displayed images as session review
artifacts.

#### Scenario: Image artifact is created
- **WHEN** the backend accepts an agent-requested or safely-derived image
  display for a session
- **THEN** it SHALL persist a review artifact whose kind identifies image
  evidence
- **AND** the artifact payload SHALL include the image MIME type, image data or
  durable image reference, display name, optional caption, and safe source
  metadata

#### Scenario: Session detail includes image artifact summary
- **WHEN** the browser loads Session Detail for a session with image evidence
- **THEN** the backend SHALL include an artifact summary that identifies the
  evidence as an image
- **AND** the summary SHALL avoid exposing machine-specific absolute paths as the
  primary display text

#### Scenario: Browser opens image artifact detail
- **WHEN** the browser requests a session image artifact
- **THEN** the backend SHALL return the artifact only when it belongs to the
  current session
- **AND** the response SHALL include enough data for the browser to render the
  image preview after reload

#### Scenario: Image artifact is linked to a tool call
- **WHEN** image evidence was created from a specific display-image tool or ACP
  tool call update
- **THEN** the artifact SHALL retain the related tool call id when available
- **AND** the session review UI SHALL be able to open it from the related tool
  activity row
