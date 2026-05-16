## ADDED Requirements

### Requirement: Workspace cockpit lists all workspace sessions by default
The workspace cockpit SHALL list all sessions in the selected workspace across all configured agents by default.

#### Scenario: Default cockpit filters
- **WHEN** the user enters a workspace cockpit
- **THEN** the status filter SHALL be All
- **AND** the agent filter SHALL be All agents
- **AND** sessions SHALL be sorted by latest activity descending

#### Scenario: Pending approval shortcut
- **WHEN** the workspace has sessions waiting for permission approval
- **THEN** the cockpit SHALL show a pending approval session count
- **AND** activating the attention shortcut SHALL apply the Pending approval status filter

### Requirement: Workspace cockpit provides composable filters
The workspace cockpit SHALL provide single-select status and agent filters that compose over the same workspace session list.

#### Scenario: Status filter narrows sessions
- **WHEN** the user selects Pending approval, Running, Failed, or View only / restore needed
- **THEN** the cockpit SHALL show only sessions matching that status group
- **AND** the agent filter SHALL continue to narrow the same result set

#### Scenario: Agent filter narrows sessions
- **WHEN** the user selects Codex, Claude, OpenCode, or Custom agents
- **THEN** the cockpit SHALL show only sessions whose owning agent matches that group
- **AND** agent selection SHALL NOT become separate primary navigation

### Requirement: Session cards are compact control summaries
Workspace cockpit session cards SHALL show compact, mobile-readable control summaries without exposing approval actions on the card.

#### Scenario: Session card core fields
- **WHEN** the cockpit renders a session card
- **THEN** the card SHALL show owning agent, permission mode, current status, prompt-derived title or summary, and last activity time
- **AND** permission mode SHALL be visible even for manual sessions

#### Scenario: Session card secondary badges
- **WHEN** a session has pending approval, queued prompts, review evidence, or view-only/restore state
- **THEN** the card MAY show compact secondary badges for those states
- **AND** pending approval SHALL be visually prominent
- **AND** approve or reject actions SHALL require opening Session Detail
