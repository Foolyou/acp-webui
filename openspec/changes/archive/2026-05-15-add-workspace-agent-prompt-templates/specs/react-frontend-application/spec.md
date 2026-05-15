## ADDED Requirements

### Requirement: React frontend supports workspace agent prompt templates
The React frontend SHALL expose reusable prompt templates in Session Detail for the current session's workspace and agent.

#### Scenario: User opens prompt templates
- **WHEN** the user opens the prompt template affordance in Session Detail
- **THEN** the frontend SHALL load templates for the current session workspace id and agent id
- **AND** it SHALL render the templates without navigating away from the session

#### Scenario: User inserts a prompt template
- **WHEN** the user selects a prompt template
- **THEN** the frontend SHALL insert the template body into the composer without submitting the prompt
- **AND** if the composer already has text, it SHALL append the template body after a blank line
- **AND** it SHALL record template use through the backend API

#### Scenario: User saves current composer text
- **WHEN** the composer has non-empty text and the user saves it as a prompt template
- **THEN** the frontend SHALL create a template for the current session workspace id and agent id
- **AND** the created template SHALL become available in the prompt template list

#### Scenario: Prompt templates do not break existing composer behavior
- **WHEN** prompt templates are displayed, inserted, created, or fail to load
- **THEN** normal prompt editing, keyboard submission, image attachments, skill autocomplete, queued prompt submission, and disabled states SHALL continue to work
