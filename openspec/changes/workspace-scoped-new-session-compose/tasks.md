## 1. Profile Storage

- [ ] 1.1 Add per-workspace last profile storage helpers with fallback from the existing global profile.
- [ ] 1.2 Add unit tests for reading, writing, resolving, and isolating workspace profiles.

## 2. Compose UI

- [ ] 2.1 Replace immediate create controls with a workspace-scoped New Session compose screen.
- [ ] 2.2 Add Start last profile and Configure manually entry behavior.
- [ ] 2.3 Require an initial prompt before enabling creation.
- [ ] 2.4 Save the confirmed profile for the current workspace after creation.

## 3. Create-And-Start API

- [ ] 3.1 Extend the create session API request with optional initial prompt and content blocks.
- [ ] 3.2 Start the first turn from the initial prompt before returning session detail.
- [ ] 3.3 Preserve existing create-session callers that do not pass an initial prompt.

## 4. Verification

- [ ] 4.1 Add frontend route and component tests for last profile and manual configuration paths.
- [ ] 4.2 Add backend tests for create session with initial prompt.
- [ ] 4.3 Run focused frontend and Go tests for session creation.
