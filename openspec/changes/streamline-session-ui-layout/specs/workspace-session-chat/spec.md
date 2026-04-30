## ADDED Requirements

### Requirement: Session Detail separates context, timeline, approval, and prompt entry
The browser SHALL render Session Detail as distinct regions so that session context, conversation history, blocking approval state, and prompt entry do not compete for the same visual surface.

#### Scenario: Session Detail renders for a live session
- **WHEN** the browser opens Session Detail for a live session
- **THEN** it SHALL show compact session context, including workspace, agent identity, mode, status, and review or diff actions, outside the prompt composer
- **AND** it SHALL keep the timeline focused on messages, notices, tool rows, approval notices, and review cards
- **AND** it SHALL keep the composer focused on prompt input and submission

#### Scenario: User scrolls a long session timeline
- **WHEN** the user scrolls through a Session Detail timeline that exceeds the viewport height
- **THEN** the prompt composer SHALL remain reachable
- **AND** enough session context SHALL remain visible or quickly reachable to identify the current session, agent, permission mode, and status

### Requirement: Pending approval minimizes prompt composer chrome
The browser SHALL reduce prompt composer prominence while a session is blocked on approval.

#### Scenario: Session waits for approval
- **WHEN** Session Detail has an active pending approval
- **THEN** the browser SHALL present the approval sheet or approval surface as the primary action area
- **AND** the composer SHALL be disabled or collapsed into a minimal blocked state that explains prompting is unavailable

#### Scenario: Approval is resolved
- **WHEN** the active pending approval is resolved and no additional approvals remain queued
- **THEN** the browser SHALL restore the normal compact prompt composer when the session returns to an idle continuable state
- **AND** the timeline SHALL preserve the approval result and subsequent assistant output in order
