## 1. Display Model

- [x] 1.1 Replace or extend `toolCallDisplay` with a typed `ToolActivityDisplay` model covering command execution, file change, file read, search, browser activity, MCP activity, and generic fallback rows.
- [x] 1.2 Derive bounded action labels, subjects, compact results, metadata, output tails, evidence actions, and diagnostics data from current timeline item fields.
- [x] 1.3 Keep raw input and output available for diagnostics while ensuring raw JSON is not part of the default collapsed display.
- [x] 1.4 Add unit tests for recognized command, file, search, browser, MCP, failed, and unknown tool activity shapes.

## 2. Timeline Rendering

- [x] 2.1 Refactor `ToolCallRow` to render a compact summary-first activity row with status, subject, outcome text, and secondary evidence/diagnostics actions.
- [x] 2.2 Render failed command-like activity with visible failed state and a bounded output or error tail when available.
- [x] 2.3 Replace generic artifact buttons with typed evidence actions for output, diff, Markdown, terminal output, artifact, and diagnostics where data is available.
- [x] 2.4 Preserve expansion or inspection behavior for diagnostics without losing Session Detail context.

## 3. Mobile Layout

- [x] 3.1 Update CSS so tool activity rows are visually lighter and denser than chat messages while remaining accessible touch targets.
- [x] 3.2 Bound long commands, paths, URLs, queries, MCP identifiers, and output tails on mobile without causing horizontal page overflow.
- [x] 3.3 Ensure evidence and diagnostics actions wrap cleanly on mobile and do not overlap the composer or adjacent timeline content.
- [x] 3.4 Keep consecutive tool activity rows scannable without creating a repeated heavy-card layout.

## 4. Evidence Integration

- [x] 4.1 Map linked review artifact summaries to typed evidence actions in the tool activity row.
- [x] 4.2 Open diff, Markdown, terminal, and generic artifact evidence through the existing session-scoped review or diagnostics surfaces.
- [x] 4.3 Keep large terminal output and raw payloads bounded behind drill-down or diagnostics controls.
- [x] 4.4 Verify review artifact cards remain available in the timeline where existing behavior requires them.

## 5. Backend Projection

- [x] 5.1 Evaluate whether frontend parsing is sufficient after real fake-ACP and stored timeline examples are updated.
- [x] 5.2 If parsing is too broad, add additive optional tool display projection fields to backend `TimelineItem::ToolCall` responses. Not required in this pass because frontend parsing remained bounded to existing fields.
- [x] 5.3 Populate optional projection fields from existing persisted tool call input/output without destructive database migration. Not required in this pass because backend projection fields were not added.
- [x] 5.4 Include updated display and evidence projection data in realtime tool call timeline upserts when backend projection fields are added. Not required in this pass because backend projection fields were not added.

## 6. Verification

- [x] 6.1 Add Playwright coverage for compact mobile tool activity rows, long subject wrapping, evidence actions, diagnostics access, and failed command output tails.
- [x] 6.2 Extend fake ACP fixtures or route mocks with representative command, file, search, browser, MCP, artifact-linked, failed, and unknown tool call examples.
- [x] 6.3 Run frontend unit tests, lint, production build, and targeted mobile Playwright checks.
- [x] 6.4 Run backend tests if backend projection fields are implemented. Not required in this pass because backend projection fields were not implemented.
