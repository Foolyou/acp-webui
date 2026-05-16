## ADDED Requirements

### Requirement: Inbox is approval focused
The global Inbox SHALL aggregate pending permission approvals across workspaces and SHALL remain focused on approval decisions for the first version.

#### Scenario: Inbox lists pending approvals
- **WHEN** one or more sessions have pending permission approvals
- **THEN** Inbox SHALL list those approvals with workspace and agent context
- **AND** selecting an item SHALL navigate to the relevant Session Detail

#### Scenario: Non-approval states are excluded
- **WHEN** sessions are failed, restore-needed, long-running, or have queued prompts without pending approval
- **THEN** Inbox SHALL NOT include them as Inbox items
