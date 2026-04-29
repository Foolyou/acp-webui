## ADDED Requirements

### Requirement: React frontend renders session restoration states
The React frontend SHALL render session restoration state in Session Detail and Sessions list without requiring a page reload.

#### Scenario: Session is restorable
- **WHEN** Session Detail loads a persisted session that can be restored but is not currently continuable
- **THEN** the React frontend SHALL show a restore or continue action
- **AND** it SHALL keep the prompt composer disabled until restoration succeeds

#### Scenario: Session is restoring
- **WHEN** a restore request is in progress for the current session
- **THEN** the React frontend SHALL show a non-blocking restoring state
- **AND** it SHALL prevent duplicate restore requests for that session

#### Scenario: Session restore fails
- **WHEN** restoration fails for the current session
- **THEN** the React frontend SHALL show a readable failure message
- **AND** it SHALL preserve access to the persisted timeline and review evidence

#### Scenario: Session is view-only
- **WHEN** a persisted session has no verified continuation path
- **THEN** the React frontend SHALL show the view-only reason
- **AND** it SHALL keep the prompt composer disabled

### Requirement: React frontend can request session restoration
The React frontend SHALL call the backend restoration API when the user chooses to continue an eligible persisted session.

#### Scenario: User chooses continue
- **WHEN** the user activates the restore or continue action for an eligible session
- **THEN** the React frontend SHALL submit a restore request for that session
- **AND** it SHALL update local application state from the backend response and realtime events

#### Scenario: Restore succeeds
- **WHEN** the backend reports that restoration succeeded
- **THEN** the React frontend SHALL mark the session as continuable
- **AND** it SHALL enable prompt submission when the session is idle and has no pending approvals

#### Scenario: Restore is unavailable
- **WHEN** the backend reports that a session cannot be restored
- **THEN** the React frontend SHALL render the backend-provided reason
- **AND** it SHALL avoid offering prompt submission for that session
