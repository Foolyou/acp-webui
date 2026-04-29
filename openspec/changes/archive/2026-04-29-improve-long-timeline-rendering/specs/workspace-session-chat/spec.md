## ADDED Requirements

### Requirement: Session timeline keeps prompt input responsive with long history
The browser SHALL keep the prompt composer responsive while Session Detail renders a long persisted session timeline.

#### Scenario: User types while a long timeline is visible
- **WHEN** the browser opens a Session Detail view with enough persisted timeline items to create a long rendered conversation
- **AND** the prompt composer is enabled
- **AND** the user types normal prompt text into the composer
- **THEN** the composer SHALL update promptly without perceptible per-keystroke lag caused by timeline layout work
- **AND** the visible timeline ordering, newest-content follow behavior, and sticky composer reachability SHALL remain unchanged

#### Scenario: Long timeline includes rich content
- **WHEN** the long timeline contains Markdown messages, tool rows, review artifact cards, notices, or running placeholders
- **THEN** the browser SHALL continue to render those timeline items in their existing order and presentation
- **AND** typing into the composer SHALL remain responsive while those items are visible
