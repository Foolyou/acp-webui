## Why

ACP Web UI now supports starting Codex sessions and approving permission requests, but users still cannot inspect the evidence of agent work from the conversation. The next product step is to make review available where the user is already supervising the session: inside Session Detail, not as a separate first-level Review destination.

## What Changes

- Add session-scoped review artifacts that summarize diffs, Markdown output, terminal output, and ACP-provided artifacts inside the Session Detail timeline.
- Add full-screen drill-down viewers opened from those timeline cards for mobile unified diffs, Markdown preview, terminal output, and raw artifact evidence.
- Add backend storage and query support for review artifacts tied to a session and, when available, the related tool call or turn.
- Normalize supported ACP session updates into review artifact data instead of only ignoring non-text updates.
- Add an on-demand `git diff` fallback scoped to the current session workspace when ACP does not provide enough diff evidence.
- Keep Review out of first-level navigation in this version; review is a mode of inspecting evidence from the active conversation.

## Capabilities

### New Capabilities
- `session-review-artifacts`: Session-scoped review evidence, including artifact summaries, drill-down data, mobile diff viewing, Markdown preview, terminal output review, and on-demand `git diff` fallback.

### Modified Capabilities
- `workspace-session-chat`: Session Detail timeline exposes review artifact cards and opens full-screen session review drill-downs from the conversation.
- `codex-agent-connection`: Supported ACP non-text session updates are normalized into review evidence where possible instead of being treated only as unsupported updates.

## Impact

- Backend models, storage migrations, and routes for session review artifacts and on-demand workspace diff retrieval.
- ACP runtime update handling for tool calls and artifact-like session updates exposed by `codex-acp`.
- Frontend Session Detail state, timeline rendering, and full-screen mobile drill-down UI.
- Tests for artifact persistence, diff fallback behavior, timeline card rendering, and mobile drill-down interaction.
