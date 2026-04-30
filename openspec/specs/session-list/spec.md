# session-list Specification

## Purpose
Define the mobile Sessions surface, including the backend session list projection, row metadata, navigation to Session Detail, realtime freshness, and loading or empty states.
## Requirements
### Requirement: Backend provides session list projection
The system SHALL provide persisted session list projections suitable for workspace-scoped navigation.

#### Scenario: Browser loads session list
- **WHEN** the browser requests the session list for a workspace
- **THEN** the backend SHALL return persisted sessions for that workspace ordered by most recent activity first
- **AND** each row SHALL include the session id, workspace id, workspace name, agent name, permission mode, current status, creation timestamp, last activity timestamp, continuity metadata, pending approval indicator, queued approval count, and review artifact availability

#### Scenario: Session has non-manual permission mode
- **WHEN** a listed session has permission mode `full_auto` or `yolo`
- **THEN** the session list row SHALL include compact permission mode metadata
- **AND** the browser SHALL be able to show the mode without loading full session detail

#### Scenario: Session has pending approval
- **WHEN** a listed session has one or more pending permission requests
- **THEN** the session list row SHALL indicate that approval is pending
- **AND** it SHALL include enough active approval summary text and queued count for the browser to show why the session needs attention

#### Scenario: Session has review evidence
- **WHEN** a listed session has one or more review artifacts or available workspace diff evidence
- **THEN** the session list row SHALL indicate that review evidence is available
- **AND** it SHALL expose a compact count or flag without including full artifact payloads

#### Scenario: Session cannot continue
- **WHEN** a listed session has persisted history but no usable ACP runtime context
- **THEN** the session list row SHALL mark the session as not continuable
- **AND** it SHALL include a compact reason suitable for the browser to present in Session Detail

### Requirement: User can open session from Sessions list
The system SHALL allow the user to navigate from a workspace-scoped session list row to the corresponding Session Detail route.

#### Scenario: User selects a session
- **WHEN** the user selects a session from the Sessions list
- **THEN** the browser SHALL navigate to that session's routed Session Detail
- **AND** it SHALL render the Session Detail for that session

#### Scenario: Selected session no longer exists
- **WHEN** the user selects a session that no longer exists or cannot be loaded
- **THEN** the browser SHALL show a readable error
- **AND** it SHALL keep the user in the current workspace context

### Requirement: Sessions list stays current during realtime updates
The system SHALL keep the visible Sessions list current as session status, approval state, permission mode metadata, and review artifact availability change.

#### Scenario: Session status changes while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a session status update
- **THEN** the browser SHALL update the affected row's status without requiring a full page reload

#### Scenario: Approval state changes while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives permission requested or permission resolved events
- **THEN** the browser SHALL update the affected row's pending approval indicator, active approval summary, and queued approval count

#### Scenario: Permission mode metadata is present while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a session projection containing permission mode metadata
- **THEN** the browser SHALL preserve and render the affected row's permission mode indicator
- **AND** it SHALL keep the row's existing status, approval, review, and continuity metadata intact

#### Scenario: Review artifact becomes available while Sessions list is visible
- **WHEN** the browser is showing the Sessions list and receives a review artifact event
- **THEN** the browser SHALL update the affected row to indicate review evidence is available

### Requirement: Sessions list supports empty and loading states
The Sessions surface SHALL provide clear loading, creation, agent selection, and empty states aligned to the routed workbench.

#### Scenario: No sessions exist
- **WHEN** the browser loads the Sessions list for a workspace and no sessions have been created
- **THEN** the browser SHALL show an empty state
- **AND** it SHALL provide a path to start a new session in that workspace with an available agent

#### Scenario: Sessions are loading
- **WHEN** the browser is fetching the Sessions list
- **THEN** the browser SHALL show a non-blocking loading state that does not obscure existing application status indicators

#### Scenario: Session is being created
- **WHEN** the user starts creating a new session from the Sessions surface
- **THEN** the browser SHALL transition to an optimistic chat creation state that identifies the selected agent
- **AND** the Sessions surface SHALL not add a permanent row until the backend returns a real session

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

### Requirement: Session list exposes configuration summaries
The system SHALL include compact launch profile and current session control summaries in session list rows when available.

#### Scenario: Listed session has launch profile metadata
- **WHEN** the browser loads a workspace session list containing a session with persisted launch profile metadata
- **THEN** the backend SHALL include display-safe launch profile summary fields in that row
- **AND** the browser SHALL show important selected launch states such as non-manual permission behavior, fast speed mode, or startup reasoning effort without loading full session detail

#### Scenario: Listed session has current session control metadata
- **WHEN** the browser loads a workspace session list containing a session with compact current control metadata
- **THEN** the backend SHALL include display-safe summaries such as current model or current reasoning control values
- **AND** the browser SHALL display those summaries without including full ACP configuration option payloads

#### Scenario: Configuration changes while session list is visible
- **WHEN** the browser is showing a session list and receives a realtime session configuration update for a listed session
- **THEN** it SHALL update that row's current session control summaries
- **AND** it SHALL keep the row's existing status, approval, review, continuity, and launch profile metadata intact

#### Scenario: Listed session has no configuration metadata
- **WHEN** the browser loads a session list row without launch profile or current session control metadata
- **THEN** it SHALL omit configuration summary UI for that row
- **AND** the row SHALL remain navigable and otherwise unchanged

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

