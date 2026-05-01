## Context

Session Detail currently turns tool activity into relatively busy transcript UI: grouped tool rows expose output buttons, artifact buttons, diagnostics controls, and raw JSON inspection. This preserves data but makes completed activity hard to scan. Image display artifacts are also linked to their originating tool calls, so users can see both a generic tool row and a separate image preview for what is conceptually one visual result.

The existing backend already persists structured tool calls and review artifacts, including image artifacts. The change is therefore a frontend presentation change: timeline normalization, display summarization, artifact rendering, overlay rendering, and tests.

## Goals / Non-Goals

**Goals:**

- Render ordinary tool calls as compact Codex-style transcript rows with only one expand/collapse affordance.
- Replace raw JSON and button-heavy detail controls with readable plain text in the expanded state.
- Treat image display artifacts as first-class image blocks in the timeline instead of rendering their linked display-image tool call as ordinary tool activity.
- Let users click an image block to view a larger image with a short description.
- Preserve persisted artifact payloads and raw data in backend logs/state for debugging.

**Non-Goals:**

- Changing ACP event ingestion, artifact persistence, or backend review artifact schemas.
- Adding new timeline filtering, pinning, or artifact management controls.
- Removing non-image review overlay support for diff, Markdown, or terminal evidence.

## Decisions

### Ordinary tools use one expand affordance

Collapsed tool rows will show the existing concise action/subject/status summary plus a single icon button for expansion. Expanded rows will show readable text details derived from normalized display data and bounded payload text.

Alternative considered: keep output/diagnostics/artifact buttons but reduce visual weight. This still leaves several competing controls per row and does not match the requested Codex-style transcript treatment.

### Expanded details are plain text, not raw JSON

Tool display helpers will produce human-readable detail text from known fields, output tails, and fallback summaries. The UI will not render JSON diagnostics in the timeline. Raw payloads remain available in application logs and persisted state, which is sufficient for debugging.

Alternative considered: render pretty-printed JSON inside the expanded section. This preserves fidelity but fails the readability goal and duplicates information already available outside the main UI.

### Image artifacts suppress their linked ordinary tool row

Timeline normalization will keep image artifacts visible as standalone image blocks and skip the linked tool call when that tool call only exists to produce the image artifact. This avoids duplicate "display_image" traces next to the actual image.

Alternative considered: render both but visually merge them in CSS. That would keep duplicate timeline blocks in the data model and make ordering/spacing harder to reason about.

### Image overlay stays visual-first

Clicking an image block will open the existing review overlay path, but image payload rendering will show only the image and description. Raw payload details will not be displayed for image artifacts in the user-facing overlay.

Alternative considered: introduce a separate image lightbox component. Reusing the review overlay keeps session-scoped access checks and mobile behavior consistent.

## Risks / Trade-offs

- Hiding diagnostics controls in the transcript can make frontend debugging less immediate -> raw data remains in logs and persisted payloads, and tests will cover readable fallback text so users still have useful context.
- Suppressing linked image tool rows could hide status metadata for the display-image tool -> the image block itself becomes the visible result, and failed/non-artifact tool calls still render normally.
- Plain-text extraction from unknown tool payloads may be less detailed than raw JSON -> fallback text will include bounded title, summary, subject, and output snippets rather than exposing structured internals.
