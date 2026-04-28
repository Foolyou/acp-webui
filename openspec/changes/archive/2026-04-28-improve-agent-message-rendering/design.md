## Context

Session Detail currently renders message content with a plain text `<div>` using `white-space: pre-wrap`. This preserves line breaks, but it drops headings, lists, code blocks, links, and other Markdown that Codex naturally emits. Review artifact Markdown has a separate lightweight renderer in `ReviewOverlay`, so message rendering and review rendering can diverge.

Tool calls are already normalized as timeline items with kind, title, summary, status, raw input, raw output, and linked review artifacts. The current frontend row exposes that structure generically and keeps raw JSON available, but it does not map common ACP tool shapes into the concise action-oriented transcript style users expect from Codex.

## Goals / Non-Goals

**Goals:**

- Render session messages and Markdown review artifacts through a shared sanitized Markdown component.
- Preserve raw message and artifact text in storage/API responses while improving presentation in the browser.
- Make tool calls read like concise Codex transcript activity: action, subject, status, preview, and evidence links.
- Keep raw tool input/output accessible for debugging without making it the default UI.
- Support live assistant streaming without layout breakage when Markdown is incomplete.

**Non-Goals:**

- Changing ACP protocol semantics or requiring upstream `codex-acp` changes.
- Building a full rich text editor for prompts.
- Rendering arbitrary raw HTML from Markdown.
- Replacing review artifact diff or terminal viewers.

## Decisions

### Use a shared sanitized Markdown renderer

Add a frontend Markdown component used by Session Detail messages and Markdown review artifact previews. The component should support GFM-style Markdown, code blocks, inline code, lists, blockquotes, links, tables if the chosen renderer supports them cleanly, and soft line breaks suitable for chat content.

The renderer must sanitize or avoid raw HTML execution. A library-based approach such as `react-markdown` with `remark-gfm` and `rehype-sanitize`, or an equivalent established React Markdown renderer with sanitization controls, is preferred over expanding the current ad hoc parser. The ad hoc parser is too narrow for streamed Codex output and would accumulate incomplete Markdown edge cases.

### Keep raw content as the data contract

Message `content` and review artifact payload text remain raw Markdown strings in the backend data model. Rendering is a frontend presentation concern unless backend projection is needed for tool display metadata. This avoids storage migration and keeps the API compatible with previously persisted sessions.

### Derive tool display metadata through a small adapter

Introduce a tool display adapter that accepts the normalized `TimelineItem.ToolCall` shape and returns a presentation model:

- `actionLabel`, such as `Ran`, `Read`, `Edited`, `Searched`, `Listed`, or a fallback based on the tool kind/title.
- `subject`, such as a shell command, file path, search query, or browser target.
- `details`, a compact list of parameters worth showing.
- `outputPreview`, a bounded text preview derived from summary/output/artifact metadata.
- `rawInput` and `rawOutput` links or disclosure content for inspection.

Start with frontend derivation from existing `input`, `output`, `toolKind`, `title`, and `summary`. Add optional backend fields only if the frontend cannot derive stable labels without duplicating ACP-specific parsing across multiple call sites. This keeps the first implementation scoped while leaving room for backend projection.

### Treat streaming Markdown as best-effort preview

Live assistant content should be rendered with the same Markdown component as persisted messages. Incomplete Markdown, especially open code fences or partial links, should render tolerantly and remain bounded by timeline layout. Once the assistant message is persisted, the final content replaces or completes the live preview.

### Preserve inspection paths

Tool rows remain expandable. Expanded rows show concise parameters and output snippets first, linked review artifacts next, and raw input/output behind a nested disclosure or similarly explicit raw inspection affordance. Markdown artifacts continue to expose raw content from the review overlay.

## Risks / Trade-offs

- Markdown XSS or unsafe links -> Use a renderer configuration that does not execute raw HTML, sanitizes generated nodes, and treats links conservatively.
- Streaming Markdown can temporarily render differently from final Markdown -> Accept best-effort rendering during streaming and ensure the final persisted message re-renders from the complete content.
- Tool payload shapes may vary across ACP versions -> Keep fallback rows based on existing kind/title/summary and keep raw payload access available.
- A new Markdown dependency increases frontend bundle surface -> Choose a maintained library with narrow configuration and cover it with build/tests.
- Richer tool rows may hide debugging details -> Keep expanded raw inspection available and test it explicitly.

## Migration Plan

No database migration is expected. Existing messages and artifacts already store raw text payloads, and existing tool call rows preserve raw input/output. If optional backend display fields are added, they should be additive API fields with frontend fallback to the existing shape.

Rollback is frontend-safe: the Markdown component can be replaced by plain text rendering, and the tool display adapter can fall back to current title/summary rows while preserving raw payload access.
