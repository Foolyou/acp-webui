## Why

The session timeline currently exposes too many controls around tool activity, including output buttons, diagnostics, artifact links, and raw JSON. This makes completed work harder to scan and makes image display feel like a generic tool trace instead of a first-class visual result.

## What Changes

- Collapse ordinary tool activity into compact Codex-style rows with a single expand affordance.
- Remove extra timeline controls for output, diagnostics, and artifact drill-down from ordinary tool rows.
- Show expanded tool details as readable plain text rather than raw JSON.
- Treat image display artifacts as first-class image blocks instead of ordinary tool entries.
- Allow image blocks to open a larger preview with only the image and a short description.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-experience-visual-system`: Timeline tool activity presentation becomes more compact, with a single expand affordance and readable text details.
- `session-review-artifacts`: Image artifacts become first-class timeline image blocks with click-to-enlarge preview behavior and no raw JSON in the main UI.

## Impact

- Frontend timeline grouping and rendering in `frontend/src/app/timelineBlocks.ts` and `frontend/src/features/sessions/SessionPane.tsx`.
- Tool display summarization in `frontend/src/utils/toolDisplay.ts`.
- Image review overlay rendering in `frontend/src/features/reviews/ReviewOverlay.tsx`.
- CSS for compact tool rows, image blocks, and enlarged image preview.
- Frontend tests covering timeline grouping, tool expansion, and image preview behavior.
