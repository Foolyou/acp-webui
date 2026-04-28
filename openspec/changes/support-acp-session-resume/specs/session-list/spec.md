## ADDED Requirements

### Requirement: Session list represents restoration state
The system SHALL include restoration state in workspace-scoped session list rows.

#### Scenario: Listed session is live
- **WHEN** a listed session has live agent runtime context
- **THEN** the session list row SHALL indicate that the session is continuable
- **AND** it SHALL avoid showing restore-required messaging

#### Scenario: Listed session is restorable
- **WHEN** a listed session has persisted history and a verified agent continuation path but no live runtime context
- **THEN** the session list row SHALL indicate that the session can be restored
- **AND** it SHALL include compact metadata suitable for opening the session and continuing from Session Detail

#### Scenario: Listed session is permanently view-only
- **WHEN** a listed session has persisted history but no verified continuation path
- **THEN** the session list row SHALL mark the session as view-only
- **AND** it SHALL include a compact reason suitable for Session Detail

#### Scenario: Listed session failed to restore
- **WHEN** a listed session has a failed restore attempt
- **THEN** the session list row SHALL expose that failure state
- **AND** it SHALL keep review evidence and normal session navigation available

### Requirement: Session list updates during restoration
The system SHALL keep visible session list rows current when restoration state changes.

#### Scenario: Restore starts while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a restore-started update
- **THEN** the browser SHALL update the affected row to show restoration is in progress

#### Scenario: Restore succeeds while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a restore-succeeded update
- **THEN** the browser SHALL update the affected row to show the session is continuable

#### Scenario: Restore fails while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a restore-failed update
- **THEN** the browser SHALL update the affected row to show the restore failure state
