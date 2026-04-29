## ADDED Requirements

### Requirement: Codex ACP launch honors permission mode
The system SHALL launch Codex ACP with configuration that matches the selected session permission mode.

#### Scenario: Codex manual runtime starts
- **WHEN** a user action first requires a Codex runtime for permission mode `manual`
- **THEN** the backend SHALL launch Codex ACP with the existing configured command and args
- **AND** Codex permission requests SHALL continue to flow through the ACP permission approval model

#### Scenario: Codex full-auto runtime starts
- **WHEN** a user action first requires a Codex runtime for permission mode `full_auto`
- **THEN** the backend SHALL launch Codex ACP with configuration equivalent to Codex CLI full-auto behavior
- **AND** the runtime SHALL remain sandboxed according to Codex full-auto semantics

#### Scenario: Codex YOLO runtime starts
- **WHEN** a user action first requires a Codex runtime for permission mode `yolo`
- **THEN** the backend SHALL launch Codex ACP with configuration equivalent to bypassing Codex approvals and sandboxing
- **AND** the runtime SHALL be reported to the browser as a YOLO runtime

#### Scenario: Mode-specific Codex launch fails
- **WHEN** Codex ACP cannot be launched or initialized for a selected permission mode
- **THEN** the backend SHALL expose a failed status for that Codex permission mode
- **AND** other Codex permission modes and other configured agents SHALL remain independently usable when ready

### Requirement: Codex permission mode mapping is explicit
The system SHALL keep Codex permission mode mappings centralized and testable.

#### Scenario: Backend builds Codex launch args
- **WHEN** the backend prepares a Codex ACP runtime for a non-manual permission mode
- **THEN** it SHALL add only the mode-specific configuration overrides needed for that mode
- **AND** it SHALL preserve user-configured Codex ACP command and base args that do not conflict with the selected mode

#### Scenario: Codex mode mapping changes in future versions
- **WHEN** the installed Codex ACP version requires a different config override shape
- **THEN** implementation tests SHALL detect the changed launch arguments or fake-runtime expectations
- **AND** unsupported mappings SHALL fail with a readable runtime error instead of silently starting in the wrong mode
