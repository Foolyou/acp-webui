## ADDED Requirements

### Requirement: Prompt templates are scoped by workspace and agent
The system SHALL persist reusable text prompt templates for a specific workspace and agent.

#### Scenario: Templates are listed for a workspace and agent
- **WHEN** the browser requests prompt templates for a workspace id and agent id
- **THEN** the backend SHALL return only non-archived templates matching that workspace and agent
- **AND** the response SHALL include each template id, title, body, tags, position, usage metadata, and timestamps

#### Scenario: Templates are isolated between agents
- **WHEN** two agents have prompt templates in the same workspace
- **THEN** a request for one agent SHALL NOT return templates belonging to the other agent

#### Scenario: Templates are isolated between workspaces
- **WHEN** the same agent has prompt templates in multiple workspaces
- **THEN** a request for one workspace SHALL NOT return templates belonging to another workspace

### Requirement: User can manage prompt templates
The system SHALL allow users to create, update, delete, and mark use of prompt templates.

#### Scenario: Template is created
- **WHEN** the browser creates a prompt template with non-empty title and body for an existing workspace and agent
- **THEN** the backend SHALL persist the template in that workspace and agent scope
- **AND** it SHALL return the created template

#### Scenario: Template creation is invalid
- **WHEN** the browser creates a prompt template with empty title or empty body
- **THEN** the backend SHALL reject the request with a readable validation error
- **AND** it SHALL NOT create a template

#### Scenario: Template is updated
- **WHEN** the browser updates a prompt template title, body, tags, or position
- **THEN** the backend SHALL persist the provided fields without changing the template workspace or agent scope
- **AND** it SHALL return the updated template

#### Scenario: Template is deleted
- **WHEN** the browser deletes a prompt template
- **THEN** the backend SHALL archive the template so it no longer appears in default template lists

#### Scenario: Template use is recorded
- **WHEN** the browser records use of a prompt template
- **THEN** the backend SHALL increment the template use count
- **AND** it SHALL update the last-used timestamp

### Requirement: Prompt template ordering is deterministic
The system SHALL return prompt templates in a stable useful order.

#### Scenario: Templates are ordered
- **WHEN** the browser lists prompt templates
- **THEN** templates SHALL be ordered by position ascending, then last-used timestamp descending, then updated timestamp descending
- **AND** templates without usage metadata SHALL still appear deterministically
