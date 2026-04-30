## 1. Agent Status Navigation

- [ ] 1.1 Add an Agents status route or routed surface to the React workbench
- [ ] 1.2 Replace the sidebar inline status stack with a compact Agents status navigation entry
- [ ] 1.3 Render all configured agents on the status surface with runtime state, message, enabled state, permission modes, and launch controls where useful
- [ ] 1.4 Ensure desktop and mobile navigation both expose the Agents status entry and preserve active-route behavior

## 2. Progressive New Session Flow

- [ ] 2.1 Refactor session creation controls to show a first-step agent list rather than all launch options
- [ ] 2.2 Add selected-agent detail and confirmation UI that shows only that agent's launch controls and permission modes
- [ ] 2.3 Preserve disabled, starting, failed, and unavailable status handling while preventing invalid confirmations
- [ ] 2.4 Keep existing workspace-scoped session creation behavior and backend API payloads unchanged

## 3. Last Profile Shortcut

- [ ] 3.1 Add browser-local Last Profile read/write helpers for recently confirmed agent id, permission mode, and launch control values
- [ ] 3.2 Show a Last Profile shortcut in New Session when the stored profile is valid for the current agent list
- [ ] 3.3 Use Last Profile to create a session directly and update it when the user confirms a different profile
- [ ] 3.4 Hide or disable Last Profile when the stored agent or launch mode is no longer available

## 4. Verification

- [ ] 4.1 Add or update unit coverage for Last Profile validation and progressive creation helper behavior
- [ ] 4.2 Add Playwright coverage for Agents navigation and status display
- [ ] 4.3 Add Playwright coverage for progressive agent selection, option confirmation, and Last Profile creation
- [ ] 4.4 Run frontend build, unit tests, lint, Playwright E2E, and OpenSpec validation
