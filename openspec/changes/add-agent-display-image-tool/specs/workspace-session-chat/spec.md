## ADDED Requirements

### Requirement: Session prompts include display-image guidance
The system SHALL include agent-facing guidance for image display when prompting
an agent in a workspace session.

#### Scenario: Prompt includes image display affordance guidance
- **WHEN** a user submits a prompt to a session whose selected agent runtime can
  receive display-image guidance
- **THEN** the backend SHALL include guidance that the agent should call
  `display_image` when it creates, modifies, locates, captures, or references an
  image the user should inspect
- **AND** the user-visible prompt content SHALL remain unchanged in persisted
  session history

#### Scenario: Agent cannot receive display-image guidance
- **WHEN** the selected agent runtime cannot receive display-image guidance or
  tool affordance metadata
- **THEN** the backend SHALL continue sending the user's prompt normally
- **AND** session prompting SHALL NOT fail solely because image display guidance
  is unavailable
