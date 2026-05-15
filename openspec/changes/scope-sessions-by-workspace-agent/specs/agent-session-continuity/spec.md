## ADDED Requirements

### Requirement: Native ACP sessions can be imported as local projections
The system SHALL import native ACP session list entries as local session projections that remain restorable or view-only until a user explicitly continues them.

#### Scenario: Native session is discovered for workspace
- **WHEN** ACP `session/list` returns a session whose cwd matches a known or newly registered workspace
- **THEN** the backend SHALL persist a local session projection with the owning workspace id, agent id, external session id, native title when available, and native updated timestamp when available
- **AND** it SHALL NOT require local timeline data to make the imported session visible in the Sessions list

#### Scenario: Native session already exists locally
- **WHEN** ACP `session/list` returns an external session id that already has a local projection for the same agent
- **THEN** the backend SHALL update mutable native metadata such as title and native updated timestamp
- **AND** it SHALL preserve local timeline, approval, review, launch profile, and continuity metadata

#### Scenario: Native import completes
- **WHEN** a native session is imported from ACP `session/list`
- **THEN** the backend SHALL NOT call ACP `session/load` for that session solely because it was imported
- **AND** prompt submission SHALL remain disabled until the session is live or successfully restored through an explicit user action

#### Scenario: Imported session can be loaded
- **WHEN** an imported session has an external session id and the selected agent advertises `session/load`
- **THEN** the backend SHALL project that session as restorable
- **AND** Session Detail SHALL allow the user to request continuation through the existing restore flow

#### Scenario: Imported session cannot be loaded
- **WHEN** an imported session has no live runtime context and no verified continuation capability applies
- **THEN** the backend SHALL project that session as view-only
- **AND** the browser SHALL keep the imported session navigable for inspection without enabling prompt submission
