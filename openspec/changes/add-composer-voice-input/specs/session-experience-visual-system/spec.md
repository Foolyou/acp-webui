## ADDED Requirements

### Requirement: Prompt composer voice control remains compact and accessible
The prompt composer SHALL present voice input as a compact secondary drafting control that remains accessible and does not disrupt the existing composer layout.

#### Scenario: Voice control renders in composer actions
- **WHEN** Session Detail renders an enabled prompt composer with voice input available
- **THEN** the browser SHALL render a voice input control alongside the existing composer actions
- **AND** the control SHALL have an accessible name that identifies whether activating it starts or stops voice input
- **AND** the control SHALL NOT replace the prompt textarea or primary Send action

#### Scenario: Voice input is listening
- **WHEN** voice input is actively listening
- **THEN** the composer SHALL show a visible listening state on or near the voice control
- **AND** the user SHALL be able to stop listening without submitting the prompt
- **AND** the composer SHALL remain focused on prompt drafting rather than expanding into a separate recording panel

#### Scenario: Voice state renders on mobile
- **WHEN** the mobile Session Detail composer renders with voice input available or listening
- **THEN** the composer controls SHALL remain reachable without horizontal overflow
- **AND** the voice control SHALL NOT consume disproportionate vertical space or obscure the timeline

#### Scenario: Voice error renders
- **WHEN** voice input encounters a recoverable error
- **THEN** the composer SHALL present the error using compact composer feedback
- **AND** the error SHALL NOT overlap the prompt textarea, attachment previews, autocomplete menu, or Send action
