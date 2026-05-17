## Why

Assistant responses can arrive wrapped in generic `text` or `txt` fenced code blocks even when the content is natural-language Markdown. On mobile this makes the conversation look like raw source: bold markers, lists, and CJK/Latin text render in a monospace preformatted block instead of readable message content.

## What Changes

- Treat whole-message `text`, `txt`, or `plaintext` fences as renderable Markdown when the fenced body appears to be prose or Markdown rather than real code.
- Preserve normal fenced-code behavior for language-specific blocks such as `json`, `ts`, `bash`, `diff`, and mixed prose/code messages.
- Keep stored backend message content unchanged; the change is a frontend rendering normalization only.
- Add regression coverage for text-fence unwrapping and code-fence preservation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `workspace-session-chat`: Session timeline Markdown rendering should keep generic text-fenced assistant prose readable while preserving real code blocks.

## Impact

- Frontend Markdown normalization and tests.
- Session Detail message rendering.
- No backend API, storage, or protocol changes.
