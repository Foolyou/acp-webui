## Why

The New Session flow currently asks users to pass through an optional first-prompt compose step before a session exists. Empty session creation is already supported, so the extra prompt step slows down the common workflow without adding necessary validation.

## What Changes

- Create a session immediately after the user chooses a valid agent launch profile or starts a remembered last profile.
- Remove the New Session first-prompt field and prompt-template controls from the pre-session creation flow.
- Keep first-message drafting and submission in Session Detail through the existing prompt composer.
- Preserve remembered per-workspace launch profile behavior and creation-loading navigation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `progressive-agent-session-start`: New Session should create directly from the selected launch profile instead of opening a pre-session first-prompt compose step.
- `workspace-session-chat`: New-session creation should not dispatch initial prompt content; first prompts should be submitted from Session Detail after the session exists.

## Impact

- Frontend New Session route and compose/create components.
- Frontend session creation helper behavior and unit tests.
- Existing session creation and prompt APIs remain unchanged.
