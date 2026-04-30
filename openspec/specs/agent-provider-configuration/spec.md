# agent-provider-configuration Specification

## Purpose
TBD - created by archiving change generalize-agent-provider-configuration. Update Purpose after archive.
## Requirements
### Requirement: Provider adapters define agent configuration behavior
The system SHALL model each configured ACP agent through a provider adapter that defines command defaults, supported launch controls, fallback mappings, and display metadata separately from shared ACP runtime behavior.

#### Scenario: Browser loads adapter-backed agent catalog
- **WHEN** the browser requests initial application state
- **THEN** the backend SHALL return configured agents with stable agent ids, provider ids, display titles, enabled state, runtime status, supported launch controls, and safe display metadata
- **AND** the backend SHALL NOT expose secrets, resolved environment values, or machine-specific command paths in the browser response

#### Scenario: Provider adapter supplies launch defaults
- **WHEN** a session is created without explicit launch control selections
- **THEN** the backend SHALL resolve that agent's default launch profile through its provider adapter
- **AND** it SHALL persist the resolved launch profile metadata on the created session

#### Scenario: Unsupported provider control is requested
- **WHEN** the browser requests a launch control value that is not advertised for the selected agent
- **THEN** the backend SHALL reject session creation with a readable validation error
- **AND** it SHALL NOT start or reuse an ACP runtime for that invalid request

### Requirement: Launch profiles capture runtime-affecting settings
The system SHALL represent runtime-affecting settings as launch profiles selected before session creation.

#### Scenario: Launch control affects runtime compatibility
- **WHEN** a selected launch control affects child process arguments, environment variables, provider config content, approval behavior, speed mode, or startup model behavior
- **THEN** the backend SHALL include that selection in the launch profile identity used to choose an ACP runtime
- **AND** sessions with incompatible launch profiles SHALL NOT share the same runtime slot

#### Scenario: Launch profile is persisted
- **WHEN** the backend creates a session with a launch profile
- **THEN** it SHALL persist the launch profile id or canonical key and display-safe selected launch control snapshot with the session
- **AND** session detail SHALL expose the selected launch controls for user inspection

#### Scenario: Existing permission mode is mapped into launch profile
- **WHEN** an existing client creates a Codex session using `permissionMode`
- **THEN** the backend SHALL map that value into the corresponding Codex launch profile
- **AND** the persisted session SHALL remain compatible with existing permission mode display semantics

#### Scenario: Launch profile definition changes later
- **WHEN** a persisted session is loaded after provider launch profile definitions have changed
- **THEN** the backend SHALL preserve the session's display-safe launch profile snapshot
- **AND** it SHALL route continuation only through a runtime that is compatible with the persisted launch profile identity

### Requirement: Controls have explicit scopes and categories
The system SHALL expose configurable agent controls using normalized metadata with explicit scope and category.

#### Scenario: Launch scoped control is advertised
- **WHEN** an agent provider supports a pre-session setting such as permission behavior, speed mode, startup reasoning effort, startup model, or provider variant
- **THEN** the backend SHALL expose it as a `launch` scoped control
- **AND** the browser SHALL present it before session creation rather than as a switchable in-session control

#### Scenario: Session scoped control is advertised by ACP
- **WHEN** an ACP agent returns a select configuration option from `session/new` or `session/load`
- **THEN** the backend SHALL expose it as a `session` scoped control in session detail
- **AND** the browser SHALL submit changes through the existing ACP `session/set_config_option` path

#### Scenario: Future scoped control is unknown to the browser
- **WHEN** the backend exposes a control scope or category that the browser does not have a first-class renderer for
- **THEN** the browser SHALL keep the session usable
- **AND** it SHALL either render a generic supported control shape or omit the unsupported control without losing existing session state

### Requirement: Provider adapters map common controls safely
The system SHALL support provider-specific mappings for common reasoning, speed, model, and permission controls without hard-coding those mappings in shared runtime management.

#### Scenario: Codex fallback launch controls are resolved
- **WHEN** a Codex launch profile selects permission, reasoning effort, or fast speed controls that are not supplied by ACP session controls
- **THEN** the Codex provider adapter SHALL map those selections to verified Codex ACP command configuration overrides
- **AND** the shared runtime manager SHALL receive only the resolved command, args, env, and display-safe profile metadata

#### Scenario: Claude fallback launch controls are resolved
- **WHEN** a Claude launch profile selects effort or fast speed controls that are not supplied by ACP session controls
- **THEN** the Claude provider adapter SHALL map those selections through verified Claude Code launch arguments, settings, or environment variables
- **AND** it SHALL advertise fast mode only when the mapping is supported for the selected Claude Code capability surface

#### Scenario: OpenCode fallback launch controls are resolved
- **WHEN** an OpenCode launch profile selects model, variant, reasoning, or provider option controls that are not supplied by ACP session controls
- **THEN** the OpenCode provider adapter SHALL map those selections through OpenCode-supported command, config, or environment mechanisms
- **AND** the shared runtime manager SHALL continue to communicate with OpenCode through the ACP subprocess protocol

#### Scenario: Agent later advertises a fallback control through ACP
- **WHEN** a provider-specific setting is available both as a fallback launch control and an ACP session control
- **THEN** the backend SHALL prefer the ACP session control for in-session changes
- **AND** it SHALL avoid presenting duplicate controls for the same effective setting in the same session

