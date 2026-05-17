## ADDED Requirements

### Requirement: Session composer uses compact icon-led actions
Session Detail SHALL keep the prompt composer focused on draft input and submission by rendering common composer actions as compact icon controls where the action has a clear icon equivalent, while preserving accessible names and readable state text.

#### Scenario: Composer renders compact actions
- **WHEN** Session Detail renders an enabled prompt composer
- **THEN** common actions such as send, stop when active, image attachment, voice input, prompt templates, and attachment removal SHALL use compact icon controls instead of persistent text-heavy buttons where an icon equivalent is available
- **AND** each icon control SHALL expose an accessible name suitable for screen readers and automated tests
- **AND** each non-obvious icon control SHALL provide a tooltip or equivalent discoverable label on hover or focus

#### Scenario: Composer preserves state text
- **WHEN** the composer needs to communicate validation errors, unsupported capability reasons, approval-blocked prompting, restoration requirements, destructive stop scope choices, or notification permission explanations
- **THEN** the browser SHALL show readable text for that state or choice
- **AND** it SHALL NOT rely on iconography alone for risk, error, or disabled-state communication

#### Scenario: Mobile composer remains compact
- **WHEN** Session Detail renders on a mobile-width viewport with composer actions available
- **THEN** the composer SHALL remain reachable without consuming disproportionate viewport height in its idle state
- **AND** composer controls SHALL NOT overlap the timeline, approval surfaces, queued prompt state, or mobile workbench chrome
- **AND** prompt drafting, attachment previews, voice input states, templates, stop, and send behavior SHALL remain usable

#### Scenario: Existing composer workflows are preserved
- **WHEN** the user types, submits, queues, attaches images, previews attachments, uses voice input, inserts prompt templates, uses skill autocomplete, stops active work, or encounters disabled composer states
- **THEN** the browser SHALL preserve the existing workflow semantics
- **AND** the compact visual treatment SHALL NOT change prompt API calls, queued prompt behavior, attachment payload ordering, transcription draft insertion, or autocomplete keyboard handling
