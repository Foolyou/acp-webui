## 1. Compact Composer

- [ ] 1.1 Audit Session Detail composer actions and identify text buttons that have clear icon equivalents
- [ ] 1.2 Convert common composer actions to accessible icon controls with stable accessible names and tooltip or focus labels
- [ ] 1.3 Preserve readable text for validation errors, disabled reasons, approval-blocked states, restoration requirements, and destructive stop scope choices
- [ ] 1.4 Adjust desktop and mobile composer styling so idle composer height stays compact while attachments, templates, voice input, queued prompts, and stop states remain usable

## 2. Mobile Workbench Utilities

- [ ] 2.1 Add or adjust mobile workbench chrome so fullscreen entry and exit are reachable when the Fullscreen API is supported
- [ ] 2.2 Add or adjust mobile workbench chrome so notification enablement is reachable when notifications are supported and permission is not denied
- [ ] 2.3 Ensure fullscreen and notification controls stay outside persistent composer actions and do not overlap mobile navigation, session status, timeline, approvals, or composer controls
- [ ] 2.4 Preserve unsupported or denied browser behavior by hiding or disabling unavailable fullscreen and notification actions without affecting realtime session updates

## 3. Verification

- [ ] 3.1 Add frontend coverage that verifies composer actions are accessible icon controls and normal prompt typing or submission still works
- [ ] 3.2 Add mobile layout coverage for compact composer height, no horizontal overflow, and no overlap with timeline, approvals, queued prompts, or workbench chrome
- [ ] 3.3 Add mobile utility coverage with mocked fullscreen and notification support to verify both controls are reachable from workbench chrome or overflow
- [ ] 3.4 Run the relevant frontend typecheck, unit, and browser automation tests for the touched surfaces
