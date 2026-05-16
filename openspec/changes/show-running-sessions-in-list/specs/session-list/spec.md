## ADDED Requirements

### Requirement: Session list highlights active sessions
The Sessions list SHALL make actively running session rows visually distinguishable from idle session rows.

#### Scenario: Session is running
- **WHEN** a listed session has status `running` or an active turn with status `running`
- **THEN** the session row SHALL show a compact running indicator distinct from the inline metadata text

#### Scenario: Session is stopping
- **WHEN** a listed session has status `stopping` or an active turn with status `stopping`
- **THEN** the session row SHALL show a compact stopping indicator distinct from the inline metadata text

#### Scenario: Session is waiting for approval
- **WHEN** a listed session has status `waiting_approval` or a pending permission summary
- **THEN** the session row SHALL show a compact waiting-approval indicator
- **AND** it SHALL preserve the existing approval detail text when a pending permission title is available

#### Scenario: Session is idle
- **WHEN** a listed session is idle and has no active turn or pending permission
- **THEN** the session row SHALL NOT show an active running-state indicator
