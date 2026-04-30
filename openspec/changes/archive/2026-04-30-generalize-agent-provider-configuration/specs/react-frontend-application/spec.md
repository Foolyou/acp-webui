## ADDED Requirements

### Requirement: Frontend renders launch-scoped agent controls
The React frontend SHALL render launch-scoped controls when the user creates a workspace session.

#### Scenario: Agent exposes launch controls
- **WHEN** the user starts creating a session with an agent that advertises launch-scoped controls
- **THEN** the browser SHALL render those controls using backend-provided labels, values, descriptions, categories, and risk metadata
- **AND** it SHALL submit the selected values with the session creation request

#### Scenario: Launch control has risky value
- **WHEN** a launch control value is marked as elevated risk
- **THEN** the browser SHALL display that risk before the user creates the session
- **AND** the created session SHALL show the selected risky launch state in Session Detail

#### Scenario: Launch controls are not available
- **WHEN** an agent advertises no launch-scoped controls
- **THEN** the browser SHALL still allow session creation with that agent's default launch profile
- **AND** it SHALL avoid rendering empty or misleading configuration controls

### Requirement: Frontend renders generic session controls
The React frontend SHALL render supported session-scoped controls from ACP configuration options.

#### Scenario: Session exposes model and reasoning controls
- **WHEN** Session Detail receives supported model and reasoning session controls
- **THEN** the browser SHALL render both controls near the prompt composer
- **AND** it SHALL send changes through the existing session configuration API

#### Scenario: Session control update succeeds
- **WHEN** the backend returns refreshed configuration state after a session control update
- **THEN** the browser SHALL update visible controls, current model metadata, and any other compact session control summaries without requiring a reload

#### Scenario: Session control update fails
- **WHEN** a session control update fails
- **THEN** the browser SHALL show a readable error
- **AND** it SHALL keep the previous local control state visible

### Requirement: Frontend supports prompt composer skill autocomplete
The React frontend SHALL integrate skill autocomplete into the prompt composer without breaking prompt submission, IME composition, or existing keyboard shortcuts.

#### Scenario: User inserts skill mention
- **WHEN** the user selects a skill from composer autocomplete
- **THEN** the browser SHALL insert the `$skill-name` mention into the prompt text
- **AND** Ctrl Enter or Command Enter SHALL continue to submit the prompt only when autocomplete is not capturing the key event

#### Scenario: User uses IME while autocomplete is available
- **WHEN** the user is composing text with an input method editor
- **THEN** the browser SHALL NOT submit the prompt or force-select an autocomplete item until composition has ended
- **AND** the user SHALL be able to continue editing normally

#### Scenario: Skill autocomplete data fails to load
- **WHEN** the browser cannot load skill autocomplete data
- **THEN** the prompt composer SHALL remain usable for normal prompt submission
- **AND** the browser SHALL surface a non-blocking error or omit suggestions
