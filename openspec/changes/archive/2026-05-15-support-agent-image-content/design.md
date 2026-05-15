## Context

The current session flow treats prompts and messages as plain strings. The browser sends `{ prompt: string }`, the backend stores `messages.content` and `queued_prompts.prompt` as text, and the ACP bridge always sends one `ContentBlock::Text` in `session/prompt`. Incoming ACP content is normalized through `text_from_content`, which ignores image and resource content.

ACP already defines structured `ContentBlock` values for prompt and session update content. Image prompt blocks require the connected agent to advertise `agentCapabilities.promptCapabilities.image`. The web UI needs to preserve current text behavior while adding a structured path for image-capable agents.

## Goals / Non-Goals

**Goals:**

- Discover and expose prompt content capabilities, especially image support.
- Accept browser-safe raster image attachments for session prompts.
- Send text and image prompt content to ACP agents as ordered content blocks.
- Persist structured message content for user, assistant, and queued prompt history.
- Render persisted and realtime image content in the session timeline.
- Preserve existing text-only sessions, clients, and tests.

**Non-Goals:**

- Audio input or output support.
- Arbitrary binary attachments beyond supported image MIME types.
- Agent-side image generation workflows beyond displaying image blocks received through ACP.
- Cross-session file library management.
- Client filesystem write support.

## Decisions

### Store structured message blocks alongside text fallback

Add an optional structured content column for messages and queued prompts while retaining the existing text columns. Existing code can continue to sort and render text content, and new code can prefer structured blocks when present.

Alternatives considered:

- Replace `messages.content` with JSON. This would make migration and backwards compatibility riskier.
- Encode images as Markdown data URLs in `content`. This would bypass ACP's structured content model and make sanitization harder.

### Inline image data in prompt API first

The browser will submit image blocks with MIME type, base64 data, and optional name. The backend will validate supported MIME types and size limits before forwarding to ACP and persisting message metadata.

Alternatives considered:

- Separate upload endpoint and attachment store before prompt submission. This is better for large files, but adds lifecycle complexity. It can follow later if image payload size or reuse becomes a problem.
- Resource links to local file paths. Browser-selected files do not necessarily exist inside the workspace or on the backend filesystem.

### Capability-gate image controls by runtime status

The frontend will enable image attachments only when the selected session's agent runtime exposes image prompt support. If capability data is missing or false, the UI will keep text prompts available and prevent image submissions.

Alternatives considered:

- Always show attachment controls and let the backend reject unsupported agents. Backend validation is still required, but UI gating avoids avoidable failed turns.

### Render only safe image MIME types

The timeline will render `image/png`, `image/jpeg`, `image/webp`, and `image/gif` blocks using generated data URLs. Other content block types remain hidden behind text fallback until explicitly supported.

Alternatives considered:

- Render SVG as image content. SVG can carry active content and is not needed for the first raster-image use case.

## Risks / Trade-offs

- Large base64 payloads can grow request bodies and the SQLite database. Mitigation: enforce per-image and total prompt size limits and document the limit in validation errors.
- Different agents may advertise different capabilities. Mitigation: expose prompt capabilities per runtime and validate again server-side.
- Realtime streaming image chunks can interleave with text. Mitigation: persist non-text blocks as complete timeline upserts and keep text streaming behavior unchanged.
- Existing clients only know `content`. Mitigation: keep `content` as text fallback and make new `contentBlocks` optional.

## Migration Plan

- Add nullable JSON text columns for structured message blocks and queued prompt blocks.
- Treat rows without structured blocks as single text blocks derived from the existing text fields.
- Rollback is compatible for text-only operation because existing `content` and `prompt` columns remain authoritative fallback values.

## Open Questions

- Whether to add a separate attachment store for larger files after the first inline implementation.
- Whether to support ACP `resource` or `resource_link` rendering in a later change.
