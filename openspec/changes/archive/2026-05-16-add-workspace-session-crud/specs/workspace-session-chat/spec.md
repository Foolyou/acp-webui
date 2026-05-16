## ADDED Requirements

### Requirement: Session chat flows remain independent from management CRUD
The system SHALL preserve existing workspace session chat behavior when workspace and persisted session management APIs are added.

#### Scenario: User creates a session after management APIs exist
- **WHEN** the user creates a session for an existing workspace through the existing session creation flow
- **THEN** the backend SHALL use the existing agent runtime creation behavior
- **AND** it SHALL persist and return Session Detail using the current session creation contract

#### Scenario: User opens session detail after management APIs exist
- **WHEN** the user opens an existing session that has not been deleted
- **THEN** the backend SHALL return Session Detail using the existing detail contract
- **AND** the browser SHALL render persisted timeline, approval, queued prompt, review, and continuity state as before

#### Scenario: User prompts after management APIs exist
- **WHEN** the user submits or queues a prompt to a continuable session
- **THEN** the backend SHALL use the existing prompt submission and queueing behavior
- **AND** management CRUD APIs SHALL NOT change ACP prompt routing or active turn lifecycle semantics

#### Scenario: Existing session list route loads after management APIs exist
- **WHEN** the browser loads a workspace-agent session list route
- **THEN** it SHALL request and render the existing session-list projection
- **AND** the projection SHALL NOT include additional management-only payload fields
