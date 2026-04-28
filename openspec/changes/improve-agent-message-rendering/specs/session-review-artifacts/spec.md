## MODIFIED Requirements

### Requirement: Markdown artifacts can be previewed
The system SHALL support previewing Markdown artifacts from session review through the same sanitized Markdown rendering behavior used for session messages.

#### Scenario: Markdown artifact is opened
- **WHEN** the user opens a Markdown review artifact from Session Detail
- **THEN** the browser SHALL show a viewport-appropriate preview of the rendered Markdown with a fixed close affordance
- **AND** it SHALL preserve access to the raw artifact content for inspection

#### Scenario: Markdown artifact contains unsafe content
- **WHEN** a Markdown review artifact contains raw HTML, scripts, or unsupported Markdown content
- **THEN** the browser SHALL NOT execute unsafe content
- **AND** the preview SHALL keep readable text visible when possible

#### Scenario: Markdown artifact is long
- **WHEN** a Markdown review artifact contains more content than fits in the viewport
- **THEN** the preview SHALL remain scrollable within the review overlay
- **AND** the fixed close affordance SHALL remain reachable
