## 1. Profile Storage

- [x] 1.1 Add per-workspace last profile storage helpers with fallback from the existing global profile.
- [x] 1.2 Add unit tests for reading, writing, resolving, and isolating workspace profiles.

## 2. Compose UI

- [x] 2.1 Replace immediate create controls with a workspace-scoped New Session compose screen.
- [x] 2.2 Add Start last profile and Configure manually entry behavior.
- [x] 2.3 Require an initial prompt before enabling creation.
- [x] 2.4 Save the confirmed profile for the current workspace after creation.

## 3. Create-And-Start API

- [x] 3.1 Extend the create session API request with optional initial prompt and content blocks.
- [x] 3.2 Start the first turn from the initial prompt before returning session detail.
- [x] 3.3 Preserve existing create-session callers that do not pass an initial prompt.

## 4. Verification

- [x] 4.1 Add frontend route and component tests for last profile and manual configuration paths.
- [x] 4.2 Add backend tests for create session with initial prompt.
- [x] 4.3 Run focused frontend and Go tests for session creation.
