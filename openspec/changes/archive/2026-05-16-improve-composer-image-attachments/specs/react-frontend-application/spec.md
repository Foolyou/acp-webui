## ADDED Requirements

### Requirement: Frontend verifies composer image attachment interactions
The React frontend SHALL include regression coverage for adding image attachments through paste and drag-and-drop and for previewing composer image attachments before submission.

#### Scenario: Pasted image attachment test runs
- **WHEN** frontend tests exercise the Session Detail composer with an image-capable agent
- **THEN** they SHALL verify that a pasted supported image appears as a composer attachment
- **AND** they SHALL verify that submitting sends the image through prompt content blocks

#### Scenario: Dropped image attachment test runs
- **WHEN** frontend tests exercise the Session Detail composer with an image-capable agent
- **THEN** they SHALL verify that a dropped supported image appears as a composer attachment
- **AND** they SHALL verify that the prompt draft remains editable before submission

#### Scenario: Composer image preview test runs
- **WHEN** frontend tests exercise an attached image thumbnail in the composer
- **THEN** they SHALL verify that selecting the thumbnail opens a larger image preview
- **AND** they SHALL verify that closing the preview preserves the draft and attachments
