## ADDED Requirements

### Requirement: Composer remains visible but disabled during approval
Session Detail SHALL keep the prompt composer in its normal location while a session is waiting for permission approval, but SHALL disable prompt submission until the approval is resolved.

#### Scenario: Waiting approval disables prompt submission
- **WHEN** the current session is waiting for permission approval
- **THEN** the prompt composer SHALL remain visible with a waiting-for-approval state
- **AND** the user SHALL NOT be able to submit or queue additional prompts

### Requirement: Queued prompts remain visible behind active work
Session Detail SHALL show queued follow-up prompts as waiting behind the active turn and SHALL keep queued prompts out of workspace attention counts.

#### Scenario: Running session has queued prompts
- **WHEN** the current session has an active turn and queued prompts
- **THEN** Session Detail SHALL show the queued prompts and their order
- **AND** the workspace attention count SHALL remain based on pending approvals only

### Requirement: Stop action distinguishes active turn and queued prompts
The UI SHALL distinguish stopping the active turn from clearing queued follow-up prompts.

#### Scenario: Stop with queued prompts asks for scope
- **WHEN** the user stops a running session that has queued prompts
- **THEN** the UI SHALL ask whether to stop only the active turn or stop the active turn and clear the queued prompts
- **AND** clearing queued prompts SHALL be an explicit user choice

#### Scenario: Stop without queued prompts is direct
- **WHEN** the user stops a running session with no queued prompts
- **THEN** the UI MAY stop the active turn directly without an additional queue-clearing choice
