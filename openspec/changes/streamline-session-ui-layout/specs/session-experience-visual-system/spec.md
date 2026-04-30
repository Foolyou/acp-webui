## ADDED Requirements

### Requirement: Workbench surfaces use compact operational density
The frontend SHALL use compact density for recurring workbench surfaces where users scan, compare, or repeatedly act on session state.

#### Scenario: Operational workbench surface renders
- **WHEN** the app renders Session Detail, Sessions list, Inbox, mobile navigation, approval, or review surfaces
- **THEN** repeated controls, status badges, list rows, tool rows, and navigation items SHALL use compact spacing appropriate for an operational tool
- **AND** empty states or focused creation flows MAY use more comfortable spacing without making recurring controls oversized

#### Scenario: Responsive layout renders on mobile
- **WHEN** the app renders on a mobile-width viewport
- **THEN** primary workbench controls SHALL remain reachable without causing horizontal overflow
- **AND** no persistent control group SHALL consume disproportionate vertical space when it is not the primary task surface

### Requirement: Prompt composer remains focused and compact
The prompt composer SHALL prioritize prompt entry and sending rather than serving as a general session configuration or status panel.

#### Scenario: Composer renders for an idle continuable session
- **WHEN** Session Detail renders for an idle continuable session
- **THEN** the composer SHALL show prompt text entry, send affordance, and keyboard hint where appropriate
- **AND** session configuration controls SHALL NOT be embedded as a permanent full-height section inside the composer

#### Scenario: Composer renders on mobile
- **WHEN** the mobile Session Detail composer is visible
- **THEN** it SHALL preserve useful timeline space above it
- **AND** its send action SHALL align with the prompt input without creating an extra mostly empty row

### Requirement: Review and approval overlays avoid unused visual space
The frontend SHALL present review and approval overlays with content-led spacing and persistent access to primary controls.

#### Scenario: Review overlay opens
- **WHEN** a user opens a review artifact
- **THEN** the overlay SHALL show a compact header, artifact summary, and artifact content without a large empty gap between summary and content
- **AND** raw payload details SHALL remain available without being the only prominent content layout

#### Scenario: Approval overlay opens
- **WHEN** a pending approval is active
- **THEN** the approval surface SHALL make the approval title, command context, and resolution actions the primary visible controls
- **AND** unrelated disabled prompt controls SHALL NOT visually compete with the approval actions
