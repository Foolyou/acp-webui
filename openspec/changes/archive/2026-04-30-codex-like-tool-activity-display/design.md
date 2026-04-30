## Context

Session Detail already receives normalized timeline items for messages, tool calls, permissions, and review artifacts. Tool calls are persisted in SQLite with raw input/output JSON and basic display fields, then rendered by the React frontend as `<details>` rows using `toolCallDisplay`.

That implementation is functional but still reads like a compact raw log. The user must expand individual rows to understand many outcomes, review artifacts are exposed through generic buttons, and mobile timelines become visually heavy when a turn contains several commands, reads, searches, or generated evidence. Codex App-style interfaces instead represent tool activity as typed work items with lifecycle state, concise outcomes, and evidence drill-downs.

This change should preserve ACP compatibility and raw diagnostics while moving the visible timeline closer to a mobile cockpit for supervising agent work.

## Goals / Non-Goals

**Goals:**

- Make common tool activity scannable in one or two compact rows on mobile.
- Distinguish command execution, file changes, file reads, searches, browser actions, MCP calls, and generic tools with stable user-facing labels.
- Show status and outcomes without requiring users to open raw JSON.
- Make terminal output, diffs, Markdown, and generic artifacts visible as typed evidence actions.
- Preserve diagnostics access for raw payloads and unknown tools.
- Keep long commands, paths, URLs, and output snippets bounded on narrow viewports.
- Add tests that protect mobile layout and display classification.

**Non-Goals:**

- Replacing ACP with the Codex App Server protocol.
- Implementing durable turn/thread event replay.
- Building a desktop side activity panel.
- Showing full terminal output directly in the timeline.
- Removing raw ACP payload access.
- Changing permission decision semantics.

## Decisions

1. Treat tool activity display as a frontend-first projection before changing persistence.

   The current backend already stores raw tool input/output, status, title, kind, summary, and artifact links. The first implementation should derive a `ToolActivityDisplay` model in the frontend so the UX can stabilize quickly. A follow-up backend projection may add optional fields once the display taxonomy is proven.

   Alternative considered: migrate the database first. That would make rendering more stable, but it slows iteration and risks encoding the wrong taxonomy before seeing how real ACP adapters shape tool payloads.

2. Use a typed display taxonomy rather than one generic "tool" presentation.

   The display layer should classify tools into command execution, file change, file read, search, browser, MCP, and generic activity. Each display kind should share core fields: action label, subject, status, compact result, metadata, evidence actions, output tail, and diagnostics.

   Alternative considered: keep the current verb-only heuristic. It is simpler, but it cannot express evidence or failure states well enough for mobile supervision.

3. Keep the timeline summary-first and evidence-second.

   A collapsed row should answer: what happened, to what subject, and did it succeed. Evidence actions should open existing review or diagnostic surfaces. Full output and raw payloads should not be visible by default.

   Alternative considered: expand failed or high-risk rows automatically. That can help debugging, but it creates unpredictable timeline height on mobile. Instead, failed rows should show a slightly richer compact result and output tail while keeping full evidence one tap away.

4. Preserve raw diagnostics behind an explicit affordance.

   Unknown payloads and ACP compatibility require raw input/output inspection. The UI should rename the current "Raw payload" behavior to diagnostics and keep it visually secondary.

   Alternative considered: remove raw payloads from the UI. That would simplify the product surface but make adapter debugging much harder while ACP support is still evolving.

5. Design mobile rows as transcript lines, not large cards.

   Mobile tool rows should use lower visual weight than chat messages: compact padding, stable status icons or labels, bounded monospace subjects, and actions that wrap predictably. Consecutive tool rows may visually group through spacing and shared density, but they should remain individually accessible.

   Alternative considered: use full cards for every tool call. That matches the current implementation but creates a card wall during active agent work.

6. Add optional backend display fields only after frontend behavior is defined.

   If frontend parsing remains complex, `TimelineItem::ToolCall` may gain optional display fields such as `displayKind`, `subject`, `metadata`, `evidence`, `outputPreview`, `exitCode`, and `durationMs`. These fields should be additive so existing clients continue to work from current raw fields.

   Alternative considered: make new display fields required immediately. That would force all adapters through a projection migration and increase risk for unknown tool shapes.

## Risks / Trade-offs

- Real ACP tool payloads may vary across agents -> Keep generic fallback rows and raw diagnostics available.
- Frontend-only parsing can drift or duplicate backend knowledge -> Treat it as a first phase and document optional backend projection fields.
- Compact mobile rows may hide useful debugging details -> Show failure status, short output tail, and one-tap diagnostics/evidence actions.
- Evidence actions can crowd narrow screens -> Use short labels, wrapping action rows, and minimum target sizes.
- Long timelines can become slower if each row computes heavy payload summaries on render -> Keep parsing bounded, memoize display derivation where needed, and preserve long-timeline responsiveness tests.
- More visual states can weaken consistency -> Use shared CSS classes and a small display taxonomy rather than per-tool bespoke components.

## Migration Plan

1. Introduce a frontend `ToolActivityDisplay` model and unit tests while preserving current timeline item shapes.
2. Replace the existing generic tool row with compact summary-first rows and diagnostics access.
3. Connect review artifact links to typed evidence actions.
4. Add Playwright coverage for mobile row layout, long command wrapping, failed command output tail, and diagnostics access.
5. If the frontend parser becomes too broad, add optional backend projection fields and populate them from the existing tool call records.
6. Keep existing raw input/output fields in API responses for compatibility and troubleshooting.

## Open Questions

- Should consecutive low-risk read/search tool calls be visually grouped in the first implementation, or only styled more compactly?
- Should terminal output drill-down reuse the review overlay immediately, or start as an expanded diagnostics section until terminal artifacts are consistently available?
- Which ACP tool payload fields should become stable backend projection fields once real Codex and Claude samples are compared?
