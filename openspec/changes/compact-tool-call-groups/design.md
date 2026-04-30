## Context

Session Detail currently renders each normalized `tool_call` timeline item as an individual compact row. This preserves detail but still creates a noisy transcript when Codex performs a burst of shell commands, file reads, browser checks, or MCP calls. The existing `toolCallDisplay` helper already classifies individual tools and produces bounded summaries, so the next step can be a frontend-only display grouping layer.

The backend normalized timeline remains the source of truth. Grouping is a render-time projection, not a persistence or API migration.

## Goals / Non-Goals

**Goals:**

- Make consecutive tool activity look like Codex transcript summaries such as `Ran 4 commands`.
- Keep single tool calls readable as direct lines such as `Ran npm run build`.
- Preserve individual tool output, artifacts, failure state, and diagnostics after expansion.
- Reduce non-actionable permission and review artifact noise in the main timeline.
- Keep mobile layouts bounded and scannable.

**Non-Goals:**

- Changing backend timeline item shapes, storage, or realtime events.
- Removing raw tool input/output diagnostics.
- Removing pending approval UI or changing permission resolution behavior.
- Building a separate activity side panel.

## Decisions

1. Add a frontend timeline block projection.

   `SessionPane` should render a derived `TimelineBlock[]` instead of mapping raw timeline items directly. A block can represent a message, a grouped set of consecutive tool calls, a standalone permission fallback, or a standalone review artifact fallback. This keeps grouping logic local to the display layer while preserving raw timeline ordering.

   Alternative considered: persist grouped tool batches in the backend. That would make grouping stable across clients, but it would prematurely encode a UI decision into the API and complicate realtime upserts.

2. Group only consecutive tool calls, with permissions and linked artifacts folded when safe.

   Consecutive `tool_call` items should join the same group until a user/assistant/system message or another major timeline item breaks the run. Permission history tied to a grouped tool call and review artifact cards already linked to grouped tool evidence should not create separate default timeline rows. If a permission or artifact cannot be associated with a visible tool call, it should remain available as a lightweight fallback row.

   Alternative considered: group all tool calls within a prompt turn. The current timeline does not expose explicit turn ids for every item, so consecutive grouping is safer and easier to reason about.

3. Derive group labels from individual `ToolCallDisplay` projections.

   The collapsed group summary should reuse existing tool classification rather than introducing a second parser. Single-call groups should use the individual action and subject. Multi-call groups should aggregate action categories into readable labels such as `Ran 4 commands`, `Read 3 files`, or `Ran 3 commands, used Node Repl`.

   Alternative considered: always label multi-call groups as `Used N tools`. That is simple but loses the Codex-like signal the user needs.

4. Preserve failure and evidence visibility in collapsed state.

   A grouped row with failed tools should expose the failure count in the collapsed summary. Expanded rows should show each tool's concise subject, status, output action, artifact actions, and diagnostics affordance. Failed tools may show bounded output tails by default inside the expanded detail.

   Alternative considered: hide all status details until expansion. That would make the timeline cleaner but obscure important failures.

5. Treat permission history as secondary transcript metadata.

   Current pending approval remains visible because it is actionable. Historical permission timeline items should not occupy large rows by default when the tool call already exists; they can be shown as compact metadata in expanded tool details or omitted if only duplicating resolved state. This matches the goal of supervising current work rather than reading protocol bookkeeping.

   Alternative considered: keep every permission item as a thin row. That is transparent but still creates noise during approval-heavy sessions.

## Risks / Trade-offs

- Grouping may hide useful debugging context -> Keep expansion one click away and preserve diagnostics.
- Review artifacts may become harder to notice -> Keep evidence buttons on the related expanded tool and preserve orphan artifact fallback rows.
- Consecutive grouping can split a logical turn if non-tool events appear between tools -> Use raw timeline boundaries for predictable behavior and revisit if the backend later exposes turn ids.
- Long histories may re-render derived blocks often -> Keep projection linear and bounded, and memoize it in the component.
- Labels for mixed tools can become awkward -> Use a small verb taxonomy with generic fallback rather than bespoke labels for every tool kind.

## Migration Plan

1. Add pure helper functions for deriving grouped timeline blocks from existing timeline items and review artifact links.
2. Replace direct `currentSession.timeline.map` rendering with block rendering in Session Detail.
3. Introduce compact group and expanded item components using existing `toolCallDisplay`.
4. Update CSS so grouped rows read as transcript activity, not repeated cards.
5. Add unit coverage for grouping and update targeted browser tests for compact grouped activity.
6. Archive the change after specs are synced and tasks pass verification.

## Open Questions

- Whether future backend turn ids should replace consecutive grouping for more precise prompt-turn batches.
- Whether resolved permission metadata should eventually be exposed in expanded tool details once ACP adapters provide consistent resolution payloads.
