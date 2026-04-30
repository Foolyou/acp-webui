## 1. Session Detail Structure

- [x] 1.1 Split Session Detail rendering into compact session context/header, timeline, approval state, and prompt composer responsibilities
- [x] 1.2 Move Diff, agent identity, permission mode, session status, and current model summary into the compact session context controls
- [x] 1.3 Make session context remain visible or quickly reachable while long timelines scroll on desktop and mobile
- [x] 1.4 Ensure timeline content remains focused on messages, notices, tool rows, approval notices, and review cards

## 2. Composer and Config Controls

- [x] 2.1 Remove permanent model/config controls from the sticky composer body
- [x] 2.2 Add a compact model selector or settings affordance in the session context controls for advertised ACP config options
- [x] 2.3 Preserve model switching disabled states and readable current-model metadata without expanding the composer
- [x] 2.4 Reduce idle composer height on desktop and mobile while preserving multiline input, send, and desktop shortcut behavior
- [x] 2.5 Align the mobile send action with the prompt input without adding a mostly empty action row

## 3. Approval, Review, and Navigation Surfaces

- [x] 3.1 Make pending approval UI the primary blocking action surface and collapse the composer to a minimal disabled state
- [x] 3.2 Tighten approval sheet title, command context, and action button layout for desktop and mobile
- [x] 3.3 Rework review overlays into compact header, summary, content, and raw-details regions with reduced empty space
- [x] 3.4 Reduce mobile navigation visual weight, bound long workspace paths, and remove unnecessary empty panel height

## 4. Lists and Session Creation

- [x] 4.1 Normalize Sessions list header, count, empty state, and creation entry hierarchy
- [x] 4.2 Make agent launch controls and permission-mode controls align consistently across available, unavailable, and disabled agents
- [x] 4.3 Keep session creation reachable when sessions exist without letting creation controls dominate the session list
- [x] 4.4 Tighten Workspaces and Inbox surfaces where shared list/header components are affected by the density changes

## 5. Verification

- [x] 5.1 Add Playwright layout assertions for desktop Session Detail composer height, horizontal overflow, and config-control placement
- [x] 5.2 Add Playwright layout assertions for mobile Session Detail top bar, context, timeline, composer height, and horizontal overflow
- [x] 5.3 Add Playwright checks for approval, review, and mobile navigation overlays with reachable primary controls
- [x] 5.4 Run frontend unit tests and Playwright E2E coverage affected by the redesigned workbench
- [x] 5.5 Capture desktop and mobile screenshots for manual review before applying the final implementation
