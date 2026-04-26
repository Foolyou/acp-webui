## Why

The current session APIs expose separate message, review artifact, permission, and session list projections that force the frontend to reconstruct a coherent timeline and cannot clearly represent tool calls or whether an old session can still continue. Reworking the session timeline data model now gives the UI a stable contract for workspace-scoped navigation, compact tool call rendering, reload behavior, and explicit view-only sessions.

## What Changes

- Introduce a normalized session timeline projection that can contain user messages, assistant messages, system messages, compact tool calls, permission events, and review artifact references in chronological order.
- Add structured tool call persistence and realtime updates so ACP tool activity is no longer represented only as generic review artifact cards.
- Add session continuity metadata such as `continuable` and `viewOnlyReason` so the backend can distinguish persisted history from sessions that still have a usable ACP runtime context.
- Replace or supplement the global session list projection with workspace-scoped session list APIs.
- Keep review artifacts as detailed drill-down evidence while linking them to timeline tool calls when applicable.
- Add a spike task to investigate whether `codex-acp` can resume Codex CLI transcript/context for persisted sessions.
- **BREAKING**: Session detail and realtime payloads may change shape to return normalized timeline items instead of separate message/artifact arrays as the primary UI contract.

## Capabilities

### New Capabilities

- `session-timeline-data-model`: Defines normalized session timeline items, tool call data, session continuity metadata, and workspace-scoped session projections.

### Modified Capabilities

- `workspace-session-chat`: Session detail, prompt eligibility, history restore, and live updates will use the normalized timeline and explicit continuity metadata.
- `session-list`: Session listing will support workspace-scoped session projections and continuity metadata.
- `session-review-artifacts`: Review artifacts will remain persisted evidence but will link to structured tool calls and no longer be the only representation of ACP tool activity.
- `codex-agent-connection`: ACP tool updates will normalize into structured tool call timeline items, and resume capability will be investigated before any continuation behavior is promised.

## Impact

- Affects Rust models, SQLite migrations, storage queries, API routes, WebSocket event shapes, ACP update normalization, and frontend TypeScript API models.
- Existing Playwright flows and backend tests will need updates for the normalized timeline contract.
- The follow-up `redesign-session-workspace-experience` change depends on this change for clean tool call rows, view-only session UI, and workspace-scoped navigation data.
