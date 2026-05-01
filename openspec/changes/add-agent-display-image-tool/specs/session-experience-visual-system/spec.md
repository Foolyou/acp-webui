## ADDED Requirements

### Requirement: Session timeline renders displayed image evidence
The frontend SHALL render displayed image evidence as visual content in Session
Detail rather than only as a file path or raw payload.

#### Scenario: Image evidence appears in timeline
- **WHEN** Session Detail receives a timeline item or artifact summary for image
  evidence
- **THEN** the browser SHALL render an inline image preview with concise title or
  caption text when available
- **AND** it SHALL provide access to the existing session-scoped artifact
  drill-down

#### Scenario: Image evidence is linked to tool activity
- **WHEN** an image artifact is linked to a visible tool activity row or grouped
  tool activity row
- **THEN** the browser SHALL keep the image reachable from that tool row's
  evidence actions
- **AND** it SHALL avoid duplicating the same image as an unrelated heavy card
  when the linked tool row is already visible

#### Scenario: Image preview renders on mobile
- **WHEN** a mobile-width viewport renders image evidence
- **THEN** the preview SHALL fit within the message or timeline container
- **AND** it SHALL NOT cause horizontal page overflow or overlap the composer,
  tool rows, or adjacent messages

### Requirement: Image artifact drill-down renders a preview
The frontend SHALL provide an image-specific review artifact drill-down.

#### Scenario: Image artifact opens
- **WHEN** the user opens an image artifact from the timeline or a tool evidence
  action
- **THEN** the review overlay SHALL render the image preview as the primary
  content
- **AND** title, caption, source metadata, and raw payload diagnostics SHALL
  remain secondary to the visual preview

#### Scenario: Image artifact cannot be previewed
- **WHEN** the artifact payload is missing image data or contains an unsupported
  image MIME type
- **THEN** the browser SHALL show a readable fallback
- **AND** it SHALL preserve access to raw artifact diagnostics
