# composer-skill-autocomplete Specification

## Purpose
TBD - created by archiving change generalize-agent-provider-configuration. Update Purpose after archive.
## Requirements
### Requirement: Backend exposes available skills for autocomplete
The system SHALL provide a backend skill discovery API suitable for prompt composer autocomplete.

#### Scenario: Browser requests skills
- **WHEN** an authenticated browser requests available skills
- **THEN** the backend SHALL return discovered skill names, descriptions when available, source category, and enabled state
- **AND** the response SHALL avoid exposing machine-specific absolute paths by default

#### Scenario: Skill metadata is malformed
- **WHEN** a discovered `SKILL.md` file cannot be parsed as valid skill metadata
- **THEN** the backend SHALL omit that malformed skill from autocomplete results or return it as disabled with a readable reason
- **AND** the malformed skill SHALL NOT prevent other valid skills from being returned

#### Scenario: Duplicate skill names exist
- **WHEN** multiple discovered skills have the same name
- **THEN** the backend SHALL return enough source metadata for the browser to distinguish them
- **AND** selecting either result SHALL insert the exact skill name syntax expected by the agent

### Requirement: Prompt composer suggests skills after dollar trigger
The browser SHALL offer skill-name suggestions when the user types a `$` skill mention in the prompt composer.

#### Scenario: User starts a skill mention
- **WHEN** the prompt composer cursor is after `$` followed by zero or more skill-name characters
- **THEN** the browser SHALL show a filtered autocomplete menu of matching skills
- **AND** the menu SHALL include skill names and concise descriptions when available

#### Scenario: User selects a skill suggestion
- **WHEN** the user chooses a skill suggestion from the autocomplete menu
- **THEN** the browser SHALL insert `$<skill-name>` at the active mention range
- **AND** it SHALL keep the remaining prompt text intact

#### Scenario: No skills match
- **WHEN** the active `$` mention text matches no discovered skill
- **THEN** the browser SHALL show an empty autocomplete state or hide the suggestions
- **AND** it SHALL allow the user to continue typing the prompt normally

#### Scenario: Composer is disabled
- **WHEN** the prompt composer is disabled because the session is running, waiting for approval, not continuable, or the owning runtime is unavailable
- **THEN** the browser SHALL NOT show interactive skill autocomplete
- **AND** existing prompt text SHALL remain unchanged

### Requirement: Skill autocomplete supports keyboard and pointer interaction
The browser SHALL make skill autocomplete usable with keyboard and pointer controls.

#### Scenario: User navigates suggestions with keyboard
- **WHEN** the skill autocomplete menu is open
- **THEN** the browser SHALL allow moving the active suggestion with arrow keys
- **AND** Enter or Tab SHALL insert the active suggestion without submitting the prompt

#### Scenario: User dismisses suggestions
- **WHEN** the skill autocomplete menu is open and the user presses Escape or moves the cursor outside the active mention
- **THEN** the browser SHALL dismiss the menu
- **AND** it SHALL preserve the current prompt text

#### Scenario: User clicks a suggestion
- **WHEN** the skill autocomplete menu is open and the user selects a suggestion with a pointer
- **THEN** the browser SHALL insert that skill mention
- **AND** it SHALL return focus to the prompt composer

