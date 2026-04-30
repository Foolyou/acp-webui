## Why

Session Detail currently overloads the prompt composer with configuration, status, and approval messaging, which consumes a large share of the viewport and creates alignment problems on desktop and mobile. The UI also uses inconsistent density across session creation, mobile navigation, approval, and review surfaces, making the app feel less like a focused local agent workbench.

## What Changes

- Reduce the prompt composer to prompt input, send action, and minimal submission affordances.
- Move live session configuration controls, including advertised model selection, out of the composer and into a compact session header/settings surface.
- Introduce a clearer Session Detail layout contract: compact session header, timeline, and bottom composer with distinct responsibilities.
- Simplify waiting-approval behavior so the approval sheet is the primary action surface and the composer falls back to a minimal disabled state.
- Tighten mobile navigation, list pages, session creation controls, and review overlays around compact workbench density.
- Add visual regression-oriented browser checks for desktop and mobile layouts that verify composer size, lack of horizontal overflow, and reachable approval/review controls.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-experience-visual-system`: establish compact density rules for Session Detail, composer, overlays, and responsive workbench surfaces.
- `workspace-session-chat`: change Session Detail UI requirements so session context, timeline, approval state, and prompt input remain distinct and usable while scrolling.
- `session-config-options`: move live model/config controls from the sticky composer area to a compact session header/settings surface while preserving visibility and disabled-state behavior.
- `session-list`: tighten Sessions list and session creation presentation so agent/mode controls and rows use consistent workbench density.
- `session-workbench-navigation`: reduce mobile navigation weight while preserving route-backed access to Inbox, Sessions, Workspaces, and workspace shortcuts.
- `react-frontend-application`: expand frontend verification expectations to include desktop/mobile layout checks for the redesigned workbench.

## Impact

- Affected frontend components: `WorkbenchShell`, `WorkbenchNav`, `SessionPane`, `SessionsPane`, `InboxPane`, `WorkspaceList`, `WorkspaceForm`, `ApprovalSheet`, `ReviewOverlay`, shared components, and CSS.
- Affected tests: Playwright E2E coverage and any component/unit tests around config controls or layout-sensitive behavior.
- No backend API or database schema changes are expected.
