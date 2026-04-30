## MODIFIED Requirements

### Requirement: Browser displays advertised model choices
The browser SHALL show a model selector in Session Detail when the current session has an advertised ACP model configuration option, and the selector SHALL live in a compact session header or session settings surface rather than as a permanent section inside the sticky prompt composer.

#### Scenario: Session detail has a model selector
- **WHEN** the browser renders Session Detail for a session with a model configuration option
- **THEN** it SHALL show the current model display name or value
- **AND** it SHALL offer the advertised model choices using the agent-provided option names and descriptions when available
- **AND** the selector SHALL remain available from the session context controls while the user scrolls through session history
- **AND** the selector SHALL NOT increase the persistent prompt composer height

#### Scenario: Session detail has dependent configuration changes
- **WHEN** a model selection response changes the full set of configuration options
- **THEN** the browser SHALL replace its local configuration option state with the returned complete state
- **AND** it SHALL update the visible current model from the refreshed state

#### Scenario: Model selector is unavailable for current state
- **WHEN** the session is running, waiting for approval, not continuable, or the owning agent runtime is not ready
- **THEN** the browser SHALL disable model switching
- **AND** it SHALL keep the current model readable when model metadata is available
- **AND** it SHALL avoid expanding the composer solely to explain the disabled state
