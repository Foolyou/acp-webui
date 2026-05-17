## Context

Session messages are rendered through `MarkdownContent`, which normalizes text before passing it to `react-markdown`. The current normalization repairs malformed fences but preserves valid fenced code blocks. Some assistant responses wrap entire natural-language answers in generic `text` fences. That is valid Markdown, but it renders as a monospace preformatted block and makes mobile Session Detail read like raw source.

## Goals / Non-Goals

**Goals:**

- Make whole-message generic text fences readable as normal Markdown.
- Preserve real code and data fences.
- Keep backend persistence and API responses unchanged.
- Keep review artifact source/raw access unchanged.

**Non-Goals:**

- Do not infer or rewrite arbitrary language-specific code fences.
- Do not add a general rendered/source toggle for all assistant messages.
- Do not change ACP payload parsing or storage.

## Decisions

1. Normalize at the Markdown renderer boundary.
   - Rationale: The backend should continue preserving raw assistant content. The display problem is frontend presentation.
   - Alternative considered: mutate stored message content. Rejected because it would lose raw fidelity and complicate replay/review.

2. Unwrap only whole-message generic text fences.
   - Rationale: A full response wrapped in `text`, `txt`, or `plaintext` is usually prose intended for display. Mixed messages can contain legitimate code examples and should keep fence structure.
   - Alternative considered: unwrap every `text` fence anywhere in a message. Rejected because it would break intentional examples of plain text blocks.

3. Preserve non-generic language fences.
   - Rationale: `json`, `ts`, `bash`, `diff`, and similar fences are likely intentional code/data blocks and should remain preformatted.

## Risks / Trade-offs

- A user may intentionally want a whole-message `text` code block. -> Mitigation: limit the behavior to generic text fences and preserve raw content in storage/API; review artifacts can still expose source where needed.
- Some malformed streaming content may temporarily render differently before completion. -> Mitigation: use the same normalization path as existing streaming Markdown and keep incomplete fences safe.
