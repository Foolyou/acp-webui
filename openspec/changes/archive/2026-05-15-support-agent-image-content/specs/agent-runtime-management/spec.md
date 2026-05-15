## ADDED Requirements

### Requirement: Agent prompt content capabilities are discoverable
The system SHALL discover and expose prompt content capabilities reported by initialized ACP agent runtimes.

#### Scenario: Runtime reports image prompt support
- **WHEN** an agent runtime initializes with `agentCapabilities.promptCapabilities.image` set to true
- **THEN** the backend SHALL include image prompt support in that runtime's reported status
- **AND** the browser SHALL be able to determine that image prompt attachments are allowed for sessions owned by that runtime

#### Scenario: Runtime omits image prompt support
- **WHEN** an agent runtime initializes without image prompt support
- **THEN** the backend SHALL report image prompt support as false
- **AND** the browser SHALL NOT allow image attachments to be submitted to that runtime
