# agent-display-image-tool Specification

## Purpose
TBD - created by archiving change add-agent-display-image-tool. Update Purpose after archive.
## Requirements
### Requirement: Agent can request image display
The system SHALL provide a model-visible `display_image` affordance that lets an
agent request inline display of an image file from the current session
workspace.

#### Scenario: Agent display tool is advertised
- **WHEN** a session is created or restored for an agent runtime that supports
  model-visible tools or equivalent client affordance metadata
- **THEN** the system SHALL make a `display_image` affordance available with a
  description that tells the agent to use it for images the user should inspect
- **AND** the affordance SHALL accept at least an image path and optional title
  or caption metadata

#### Scenario: Agent requests valid image display
- **WHEN** the agent requests `display_image` for a supported image file inside
  the session workspace
- **THEN** the backend SHALL create durable session image evidence for that
  image
- **AND** the browser SHALL be able to display the image without requiring the
  user to open the file manually

#### Scenario: Agent requests image outside workspace
- **WHEN** the agent requests `display_image` for a path outside the session
  workspace
- **THEN** the backend SHALL reject the request
- **AND** it SHALL NOT expose or persist the outside file contents

#### Scenario: Agent requests unsupported image display
- **WHEN** the agent requests `display_image` for a directory, missing file,
  unsupported MIME type, or image larger than the configured limit
- **THEN** the backend SHALL reject the request with a readable reason
- **AND** the session SHALL remain usable

### Requirement: Agent guidance encourages image display
The system SHALL provide hidden guidance that recommends using the
`display_image` affordance when an agent produces or references images.

#### Scenario: Prompt is sent to an image-display-capable agent
- **WHEN** the backend sends a prompt turn to an agent runtime that can receive
  display-image guidance
- **THEN** the prompt context SHALL instruct the agent to prefer calling
  `display_image` after creating, modifying, locating, capturing, or referencing
  an image that the user should see
- **AND** the guidance SHALL discourage only telling the user a directory or
  file path when inline display is available

#### Scenario: Tool call succeeds
- **WHEN** the `display_image` request creates image evidence successfully
- **THEN** the tool or extension response SHALL indicate that the image was
  displayed
- **AND** it SHALL include enough non-sensitive metadata for the agent to avoid
  repeating the same path as the only answer

### Requirement: Plain image paths can be enriched safely
The system SHALL conservatively enrich plain assistant or tool output paths into
image evidence when an agent does not call the explicit display affordance.

#### Scenario: Assistant mentions safe workspace image path
- **WHEN** an assistant message or tool output contains a local image path that
  resolves inside the session workspace and passes image validation
- **THEN** the backend MAY create durable image evidence for that file
- **AND** the browser SHALL render the evidence without changing the original
  message text

#### Scenario: Assistant mentions unsafe or ambiguous path
- **WHEN** a text path is outside the workspace, remote, unsupported,
  nonexistent, ambiguous, or too large
- **THEN** the backend SHALL NOT create image evidence from that path
- **AND** the original text SHALL remain visible

