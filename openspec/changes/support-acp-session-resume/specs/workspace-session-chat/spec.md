## ADDED Requirements

### Requirement: Session detail exposes restoration state
The system SHALL include restoration state when returning Session Detail for persisted sessions.

#### Scenario: Browser opens a restorable session
- **WHEN** the browser loads Session Detail for a persisted session whose agent runtime context is not live but can be restored
- **THEN** the backend SHALL return the persisted workspace, session metadata, normalized timeline, and continuity metadata
- **AND** it SHALL identify that the session must be restored before new prompts can be sent

#### Scenario: Browser opens a restore-failed session
- **WHEN** the browser loads Session Detail for a session whose latest restore attempt failed
- **THEN** the backend SHALL return the persisted timeline for review
- **AND** it SHALL include a readable failure reason
- **AND** it SHALL keep the composer disabled for that session

### Requirement: User can restore a persisted session before prompting
The system SHALL allow a user to restore an eligible persisted session before submitting a new text prompt.

#### Scenario: User restores loadable session
- **WHEN** the user requests continuation for a loadable persisted session
- **THEN** the backend SHALL attempt to restore the agent runtime context through the verified agent continuation path
- **AND** the browser SHALL show that restoration is in progress

#### Scenario: Restore completes before prompting
- **WHEN** restoration completes successfully for a persisted session
- **THEN** the backend SHALL mark the session as continuable
- **AND** the browser SHALL enable prompt submission when the session is idle and has no pending approvals

#### Scenario: Prompt is submitted before restore completes
- **WHEN** the user attempts to submit a prompt while a session is restorable but not yet restored
- **THEN** the system SHALL reject the prompt
- **AND** the browser SHALL indicate that the session must be restored before continuing

### Requirement: Restored sessions preserve timeline continuity
The system SHALL preserve the existing local timeline while restoring agent runtime context.

#### Scenario: Restore replays existing history
- **WHEN** the agent replays history during restore
- **THEN** the backend SHALL reconcile replayed updates with the existing normalized timeline
- **AND** the browser SHALL not show duplicate messages, tool calls, approvals, or review cards

#### Scenario: Restore succeeds after backend restart
- **WHEN** a user restores a persisted session after backend restart
- **THEN** the browser SHALL continue showing the same local timeline
- **AND** any new prompt submitted after restore SHALL append to that session timeline
