## ADDED Requirements

### Requirement: Completed assistant messages are finalized with turn state
The system SHALL finalize live assistant timeline messages when the prompt turn that produced them finishes, stops, fails, or is repaired as stale.

#### Scenario: Prompt turn completes
- **WHEN** an active prompt turn completes successfully
- **THEN** any assistant message persisted as `running` for that turn SHALL be updated to `idle`
- **AND** connected browsers SHALL receive enough realtime timeline data to render the completed assistant message without a running indicator

#### Scenario: Prompt turn is stopped or fails
- **WHEN** an active prompt turn is stopped or fails after assistant content has been persisted
- **THEN** the persisted assistant message SHALL no longer remain indefinitely `running`
- **AND** session detail SHALL remain reviewable with the final available assistant content

### Requirement: Stale running session state is repaired
The system SHALL repair persisted session rows that claim active work without active-turn metadata when no pending approval blocks repair.

#### Scenario: Backend starts with stale running session
- **WHEN** the backend starts and finds a session with status `running` or `stopping`, no active-turn metadata, and no pending permission request
- **THEN** it SHALL repair the session to a non-running state
- **AND** it SHALL finalize any running assistant message that no active turn can still own

#### Scenario: Stale session has queued prompts
- **WHEN** a stale running session has queued prompts behind the missing active turn
- **THEN** the backend SHALL avoid silently dispatching those queued prompts as if the missing turn completed normally
- **AND** session detail SHALL expose queue state that is not blocked by a false active-turn indicator
