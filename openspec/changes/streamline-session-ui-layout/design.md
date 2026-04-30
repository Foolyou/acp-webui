## Context

The current React frontend has the right route structure and functional workflow, but several surfaces share responsibilities too broadly. Session Detail is the main pain point: the sticky composer contains ACP config controls, status messaging, prompt input, keyboard hint, and send action. On desktop this leaves large unused space inside the composer; on mobile it consumes a large part of the viewport and pushes conversation content away.

Other surfaces repeat the same density issue in different forms: the Sessions empty state keeps large agent creation controls expanded, mobile navigation uses a nearly full-screen modal even when content is short, approval displays a modal while the disabled composer remains visually prominent behind it, and review overlays reserve more empty space than their content requires.

The change should preserve existing APIs and workflows while making the UI feel like a compact operational tool.

## Goals / Non-Goals

**Goals:**
- Separate Session Detail into clear header, timeline, approval state, and composer responsibilities.
- Keep the composer focused on prompt entry and reduce its desktop and mobile footprint.
- Move session config controls out of the composer while keeping them reachable and readable.
- Establish compact density rules for workbench navigation, lists, approval, review, and session creation.
- Add automated desktop and mobile layout checks so regressions are visible before manual review.

**Non-Goals:**
- Redesign the product brand, color palette, or typography from scratch.
- Add new backend endpoints, database tables, or ACP behavior.
- Introduce Figma, image generation, or a new design-system dependency for this iteration.
- Change permission semantics, model switching semantics, or realtime event semantics.

## Decisions

### Keep implementation in the existing React/CSS stack

Use the existing Vite React app, React Aria primitives, TanStack Router, and CSS token system. This keeps the work scoped to the frontend and avoids turning a layout fix into a dependency migration.

Alternatives considered:
- Figma-first redesign: useful for team review later, but higher setup cost and slower for this repo-local iteration.
- Static image mockups: fast for visual exploration, but lossy for responsive and sticky behavior.
- A new component library: unnecessary because the current UI already has accessible primitives and tokenized styling.

### Make Session Detail a three-region layout

Session Detail should have:
- a compact session header for workspace/session context, status badges, Diff, and session settings;
- a timeline region for messages, notices, tool rows, and review cards;
- a bottom composer for prompt text and send controls only.

The session header should remain visible enough to preserve context. On desktop, it can be sticky within the content column. On mobile, global navigation stays in the top bar and session context can be shown as a compact strip below it.

Alternatives considered:
- Keep controls in the composer but make them smaller: this reduces height but preserves the core responsibility problem.
- Put all controls in a modal: this hides frequently needed session state and makes simple model checks slower.

### Move ACP config controls into session settings

Single important controls, such as model selection, may render directly in the compact session header when space allows. Multiple or verbose controls should collapse into a session settings popover/sheet. Disabled-state explanations should remain available through title text, helper text, or a compact inline reason, not a permanent tall block in the composer.

Alternatives considered:
- Keep the model selector sticky near the input: this was the prior contract, but the current implementation shows it creates disproportionate vertical cost.
- Put model state only in Sessions list: this is insufficient because users need to inspect or change the active session configuration while working.

### Treat approval as the primary blocking surface

When a pending approval exists, the approval sheet should be the only primary action surface. The composer should collapse to a minimal disabled affordance or status line so it does not compete with the approval UI.

Alternatives considered:
- Keep the full disabled composer visible: it explains why prompting is blocked, but repeats information already shown in the approval sheet and consumes space.
- Move approval into the timeline only: this would make approval harder to reach on long conversations.

### Use compact defaults for operational surfaces

Workbench navigation, list rows, session creation controls, review overlays, and status badges should default to compact density. Larger comfortable spacing remains acceptable for empty states and focused creation flows, but operational pages should favor scanning and repeated use.

Alternatives considered:
- Apply one global density reduction: cheaper, but likely to make empty states and primary actions feel cramped.
- Keep each surface bespoke: preserves current inconsistency and makes future regressions more likely.

### Validate with real browser layout checks

Extend Playwright coverage with viewport-specific assertions for composer height, horizontal overflow, sticky reachability, approval controls, review overlay content density, and mobile navigation content bounds.

Alternatives considered:
- Snapshot-only manual review: helpful during design, but insufficient as a regression guard.
- Pixel-perfect screenshot tests: too brittle for this stage; structural layout metrics are a better first guard.

## Risks / Trade-offs

- Compacting controls may hide some explanatory text -> Keep full descriptions available through titles, accessible labels, or expandable details.
- Moving model selection out of the composer changes a recently added UX contract -> Preserve model visibility in Session Detail and update tests/specs explicitly.
- Sticky header plus sticky composer can reduce timeline space on small screens -> Use compact mobile heights and verify remaining visible timeline space in Playwright.
- Collapsing session creation controls may make first-session creation less obvious -> Keep empty-state creation visible, but normalize width, alignment, and hierarchy.
- Layout assertions can be flaky if based on exact pixels -> Assert conservative bounds and semantic reachability rather than exact visual matches.
