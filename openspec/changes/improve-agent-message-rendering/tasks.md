## 1. Markdown Rendering

- [x] 1.1 Add a shared sanitized Markdown renderer component and the minimal maintained dependencies needed for GFM-style chat content.
- [x] 1.2 Replace plain session message rendering in `SessionPane` with the shared Markdown renderer for persisted and live assistant/user messages.
- [x] 1.3 Replace the ad hoc Markdown preview in `ReviewOverlay` with the shared Markdown renderer while preserving raw artifact access.
- [x] 1.4 Add timeline and review overlay styles for headings, lists, links, inline code, fenced code blocks, tables if supported, long links, and mobile overflow.

## 2. Tool Call Presentation

- [x] 2.1 Add a tool call display projection helper that maps normalized tool call items into action label, subject, details, output preview, artifact links, and raw payload access.
- [x] 2.2 Cover the projection helper with cases for shell commands, file reads, file edits, searches, list operations, browser or MCP-style operations, and unknown fallback payloads.
- [x] 2.3 Update compact tool call rows to render Codex-like action, subject, status, and preview text without raw JSON by default.
- [x] 2.4 Update expanded tool call rows to show concise parameters, bounded output snippets, linked review artifacts, and explicit raw input/output inspection.
- [x] 2.5 Verify the existing timeline API exposes enough persisted tool call data for the projection helper; add additive display fields only if the existing normalized item shape is insufficient.

## 3. Validation

- [x] 3.1 Add or update frontend tests for Markdown message rendering, unsafe Markdown handling, live streaming content, Markdown artifact preview, and tool row fallback behavior.
- [x] 3.2 Extend the fake ACP or E2E scenario data to include Markdown-rich assistant output and representative tool calls.
- [x] 3.3 Run `npm run build`, `cargo test`, and `npm run e2e`.
- [x] 3.4 Run `openspec validate improve-agent-message-rendering --strict` after implementation and mark tasks complete only after the behavior matches the spec deltas.
