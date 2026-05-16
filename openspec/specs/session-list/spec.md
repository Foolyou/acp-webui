# session-list Specification

## Purpose
Define the mobile workspace cockpit session surface, including backend session list projections, card metadata, navigation to Session Detail, realtime freshness, filtering, and loading or empty states.
## Requirements
### Requirement: Backend provides session list projection
The system SHALL provide persisted session list projections suitable for workspace-scoped cockpit navigation and compatibility agent filtering.

#### Scenario: Browser loads session list
- **WHEN** the browser requests the session list for a workspace
- **THEN** the backend SHALL return persisted sessions for that workspace ordered by most recent activity first
- **AND** each row SHALL include the session id, workspace id, workspace name, agent id, agent name, title when available, permission mode, current status, creation timestamp, last activity timestamp, native updated timestamp when available, continuity metadata, pending approval indicator, queued approval count, and review artifact availability

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
- **THEN** the browser SHALL navigate to that session's routed Session Detail including workspace id, agent id, and session id
- **AND** it SHALL render the Session Detail for that session

#### Scenario: Selected session no longer exists
- **WHEN** the user selects a session that no longer exists or cannot be loaded
- **THEN** the browser SHALL show a readable error
- **AND** it SHALL keep the user in the current workspace and agent context

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
The Sessions surface SHALL provide clear loading, creation, filtering, and empty states aligned to the routed workspace cockpit.

#### Scenario: No sessions match active filters
- **WHEN** the browser loads the Sessions list for a workspace and no sessions match the active filters
- **THEN** the browser SHALL show an empty state for that workspace or filter scope
- **AND** it SHALL provide a path to start a new session in that workspace

#### Scenario: Sessions are loading
- **WHEN** the browser is fetching the Sessions list for a workspace and active filters
- **THEN** the browser SHALL show a non-blocking loading state that does not obscure existing application status indicators

#### Scenario: Session is being created
- **WHEN** the user starts creating a new session from the Sessions surface
- **THEN** the browser SHALL transition to an optimistic creation state scoped to the selected workspace and launch profile
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

### Requirement: Sessions surface supports agent filtering
The Sessions surface SHALL render all workspace sessions by default and SHALL allow the user to narrow the visible list by agent.

#### Scenario: User views workspace sessions
- **WHEN** the workspace Sessions surface is visible
- **THEN** it SHALL show all sessions whose persisted workspace id matches that context
- **AND** it SHALL show each session's owning agent on the session card

#### Scenario: User changes agent filter
- **WHEN** the user changes the agent filter
- **THEN** the browser SHALL narrow the visible workspace session list to matching sessions
- **AND** rows from other agents SHALL remain reachable by changing the filter

#### Scenario: Existing sessions belong to other agents
- **WHEN** sessions exist for the workspace under multiple agents
- **THEN** the default Sessions surface SHALL keep those sessions visible together
- **AND** it SHALL make each agent subset reachable through the agent filter

### Requirement: Session list refreshes after native import
The system SHALL keep the visible workspace Sessions list current when native ACP sessions are imported or updated.

#### Scenario: Native sessions are imported for visible scope
- **WHEN** the backend imports native sessions for the workspace currently visible in the browser
- **THEN** the browser SHALL refresh or patch the visible session list
- **AND** it SHALL show newly imported sessions without requiring a page reload

#### Scenario: Native sessions are imported for another agent
- **WHEN** the backend imports native sessions for an agent hidden by the current agent filter
- **THEN** the browser SHALL preserve the active filter
- **AND** it SHALL make the imported sessions visible when the user changes back to All agents or the matching agent filter

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

### Requirement: Session cards expose secondary queue and review badges
Workspace cockpit session cards SHALL treat queued prompt and review evidence availability as secondary status without making those states workspace attention.

#### Scenario: Queued prompt badge
- **WHEN** a session has queued follow-up prompts
- **THEN** its workspace cockpit card MAY show the queued prompt count as secondary status
- **AND** the queued prompt count SHALL NOT contribute to the pending approval attention count

#### Scenario: Review evidence badge
- **WHEN** a session has review artifacts
- **THEN** its workspace cockpit card MAY show a lightweight review evidence badge
- **AND** detailed inspection SHALL require opening Session Detail or the review viewer
