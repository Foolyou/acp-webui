## ADDED Requirements

### Requirement: Sessions surface uses compact creation and row density
The Sessions surface SHALL present session creation controls and session rows with consistent compact workbench density.

#### Scenario: No sessions exist
- **WHEN** the browser loads a workspace Sessions surface with no sessions
- **THEN** it SHALL show an empty state with a visible path to create a session
- **AND** agent, launch-control, and permission-mode controls SHALL align consistently across available agents without causing uneven card widths or unnecessary empty space

#### Scenario: Existing sessions are listed
- **WHEN** the browser loads a workspace Sessions surface with existing sessions
- **THEN** it SHALL show session rows using a scan-friendly hierarchy for workspace, agent, status, model, permission mode, approval, review, and continuity metadata
- **AND** creation controls SHALL be available without dominating the list above the session rows

#### Scenario: Agent has disabled or failed modes
- **WHEN** the session creation area includes disabled, failed, idle, and ready agent modes together
- **THEN** it SHALL keep available modes visually comparable and selectable where allowed
- **AND** unavailable modes SHALL show readable status without breaking row or grid alignment
