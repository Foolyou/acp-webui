## MODIFIED Requirements

### Requirement: User can resolve supported permission options
The system SHALL allow the user to select ACP permission options for a pending request when the option was provided by the agent.

#### Scenario: User selects an allow-once option
- **WHEN** the user selects a pending option whose kind is `allow_once`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User selects a reject-once option
- **WHEN** the user selects a pending option whose kind is `reject_once`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User selects an allow-always option
- **WHEN** the user selects a pending option whose kind is `allow_always`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User selects a reject-always option
- **WHEN** the user selects a pending option whose kind is `reject_always`
- **THEN** the backend SHALL mark the permission request as selected with that option id
- **AND** it SHALL respond to ACP with a selected permission outcome containing the same option id
- **AND** it SHALL update the session status to `running` only if no other approvals remain pending
- **AND** connected browsers SHALL receive a `permission_resolved` event

#### Scenario: User resolves a non-pending request
- **WHEN** the browser tries to resolve a permission request that is already selected, cancelled, or expired
- **THEN** the backend SHALL reject the resolution request
- **AND** it SHALL NOT send another permission response to ACP

## REMOVED Requirements

### Requirement: Always options are visible but disabled
**Reason**: Agents such as Codex and Claude can own their native long-lived permission behavior. Disabling these options in the web client prevents ACP sessions from matching the expected CLI experience.

**Migration**: Treat `allow_always` and `reject_always` options as selectable agent-provided choices and forward the selected option id to ACP.
