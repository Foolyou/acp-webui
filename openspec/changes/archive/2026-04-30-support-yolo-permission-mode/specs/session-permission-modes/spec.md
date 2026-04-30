## ADDED Requirements

### Requirement: Session permission modes are defined
The system SHALL define canonical session permission modes that describe how the selected agent handles approvals and sandboxing for a session.

#### Scenario: Manual mode is the default
- **WHEN** a client creates a session without specifying a permission mode
- **THEN** the backend SHALL assign `manual` as the session permission mode
- **AND** the session SHALL use the existing ACP permission approval flow

#### Scenario: Supported modes are exposed
- **WHEN** the browser loads application state or session creation metadata
- **THEN** the backend SHALL expose the permission modes supported by each available agent
- **AND** each mode SHALL include a stable id, display label, and risk level suitable for browser presentation

#### Scenario: Unsupported mode is rejected
- **WHEN** a client requests a permission mode that the selected agent does not support
- **THEN** the backend SHALL reject session creation with a readable validation error
- **AND** no ACP session SHALL be created

### Requirement: Permission mode is persisted per session
The system SHALL persist the selected permission mode with the local session record and return it in session projections.

#### Scenario: New session is created with explicit mode
- **WHEN** the user creates a session with a supported non-default permission mode
- **THEN** the backend SHALL persist that mode on the created session
- **AND** session detail SHALL return the same mode after page reload

#### Scenario: Existing sessions are migrated
- **WHEN** storage contains sessions created before permission mode support
- **THEN** the migration SHALL assign those sessions `manual`
- **AND** their timeline, approval, review, continuity, and agent metadata SHALL remain available

### Requirement: Permission mode is immutable for an existing session
The system SHALL keep permission mode as a session creation-time choice in the first version.

#### Scenario: Browser opens an existing session
- **WHEN** the browser renders Session Detail for an existing session
- **THEN** it SHALL show the selected permission mode
- **AND** it SHALL NOT offer a control to change that session's permission mode

#### Scenario: API client attempts mode change
- **WHEN** a client attempts to change permission mode for an existing session through a mutation endpoint
- **THEN** the backend SHALL reject the request or omit such an endpoint
- **AND** the existing session's persisted permission mode SHALL remain unchanged

### Requirement: YOLO mode is visibly distinguished
The system SHALL make `yolo` sessions visibly distinct from normal approval-managed sessions.

#### Scenario: User creates a YOLO session
- **WHEN** the browser presents `yolo` as a session creation option
- **THEN** it SHALL show copy that communicates approvals and sandboxing are bypassed
- **AND** the user SHALL be able to distinguish it from `manual` and `full_auto` before creating the session

#### Scenario: User reviews a YOLO session
- **WHEN** the browser renders Session Detail or Sessions list for a `yolo` session
- **THEN** it SHALL show a persistent visible YOLO indicator
- **AND** the indicator SHALL remain visible after browser reload

### Requirement: Permission mode controls runtime behavior
The system SHALL route session operations through an agent runtime compatible with the session's permission mode.

#### Scenario: Manual session uses manual runtime
- **WHEN** a session has permission mode `manual`
- **THEN** the backend SHALL create, prompt, restore, and resolve approvals through an agent runtime configured for manual approval behavior

#### Scenario: Full-auto session uses full-auto runtime
- **WHEN** a Codex session has permission mode `full_auto`
- **THEN** the backend SHALL create, prompt, and restore it through a Codex runtime configured for low-friction sandboxed automatic execution
- **AND** it SHALL NOT share that runtime with `manual` or `yolo` Codex sessions

#### Scenario: YOLO session uses YOLO runtime
- **WHEN** a Codex session has permission mode `yolo`
- **THEN** the backend SHALL create, prompt, and restore it through a Codex runtime configured to bypass approvals and sandboxing
- **AND** it SHALL NOT share that runtime with `manual` or `full_auto` Codex sessions
