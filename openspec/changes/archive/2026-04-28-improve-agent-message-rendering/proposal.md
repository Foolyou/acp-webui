## Why

Agent output in Session Detail currently renders as plain text, so Markdown structure from Codex responses is lost. Tool activity is also displayed as generic expandable rows, which makes ACP tool updates feel unlike the Codex transcript and pushes users toward raw payload inspection too early.

## What Changes

- Render agent and user message content as sanitized Markdown while preserving streaming updates, multiline text, code blocks, lists, links, and inline formatting.
- Reuse the Markdown rendering path for Markdown review artifacts so session messages and drill-down previews behave consistently.
- Redesign tool call timeline rows to present Codex-like activity entries: concise action label, subject, status, parameters/output previews, and linked review evidence.
- Keep raw ACP input/output payloads available behind an explicit expanded inspection affordance instead of showing raw JSON as the primary representation.
- Add or derive stable display metadata for tool calls so the frontend can render common actions such as shell commands, file reads, searches, edits, and browser/tool operations without relying on ad hoc string formatting in the component tree.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `workspace-session-chat`: Session timeline text responses render Markdown-aware content instead of plain text only.
- `session-experience-visual-system`: Message typography and tool call rows follow the updated Markdown and Codex-like transcript presentation.
- `session-timeline-data-model`: Tool call timeline items expose or preserve enough structured display metadata for concise rendering without raw JSON by default.
- `session-review-artifacts`: Markdown review artifacts use the shared Markdown preview behavior and preserve raw content access.

## Impact

- Frontend session timeline rendering in `frontend/src/features/sessions/SessionPane.tsx` and related timeline styles.
- Review overlay Markdown preview behavior in `frontend/src/features/reviews/ReviewOverlay.tsx`.
- Shared frontend rendering utilities/components for sanitized Markdown and tool call display projection.
- Potential backend timeline projection changes in `src/acp.rs`, `src/models.rs`, and storage/API serialization if frontend-only derivation is insufficient.
- Test coverage for Markdown rendering, streaming text behavior, tool call display fallbacks, raw payload access, and review artifact previews.
