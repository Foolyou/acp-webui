## Context

ACP Web UI currently treats Session Detail as the main cockpit and already supports persisted chat history, live assistant text, pending approval state, and an Inbox projection for approvals. The product design now explicitly keeps Review out of first-level navigation: review evidence should appear in the conversation and open session-scoped full-screen drill-downs.

The backend currently persists messages and permission requests, while non-text ACP session updates are mostly tolerated and ignored. That is sufficient for chat and approval, but it leaves tool calls, diffs, Markdown output, terminal output, and other evidence unavailable to mobile users.

## Goals / Non-Goals

**Goals:**

- Persist session-scoped review artifacts that can represent diffs, Markdown, terminal output, ACP artifacts, and generic evidence.
- Render compact review cards in the Session Detail timeline so evidence remains connected to the conversation.
- Provide mobile full-screen drill-downs for unified diffs, Markdown preview, terminal output, and raw artifact details.
- Add an on-demand `git diff` fallback scoped to the session workspace when ACP evidence is incomplete.
- Normalize supported ACP non-text updates into review evidence without making the browser consume raw ACP messages directly.

**Non-Goals:**

- No first-level Review tab or global review dashboard in this version.
- No side-by-side diff viewer on mobile.
- No direct mobile code editing, patch staging, comments, or checklist review notes.
- No eager `git diff` execution after every file write.
- No full normalized event replay architecture beyond what is necessary to surface review artifacts.

## Decisions

### Store review artifacts separately from chat messages

Review evidence should use a dedicated `review_artifacts` model instead of overloading `messages`. Chat messages are conversational text; review artifacts need kind, title, summary, structured payload, optional source metadata, and stable identifiers for drill-down routes.

Alternative considered: encode artifact cards as system messages. That would be faster but would blur content semantics, make drill-down APIs awkward, and make future retention policies harder.

### Keep artifact cards session-scoped

Artifacts should belong to a session and optionally link to a tool call id or turn context when that data exists. This matches the product decision that review is entered from Session Detail, not through a global Review surface.

Alternative considered: workspace-scoped review records. Workspace-level data may be useful later for a session list summary, but the first useful interaction is "what evidence belongs to this agent turn?"

### Use structured payloads with typed summaries

The backend should persist a compact summary for timeline cards and a JSON payload for drill-down detail. The UI should not parse raw ACP messages directly; it should consume normalized artifact records.

Expected initial artifact kinds:

- `diff`
- `markdown`
- `terminal`
- `tool_call`
- `generic`

The kind list can expand as ACP adapter behavior becomes clearer.

### Add on-demand diff fallback as a session review endpoint

When ACP does not provide a diff artifact, the frontend should be able to request a session-scoped workspace diff. The backend should run `git diff` only when the user opens that review evidence, and it should return a normalized diff artifact payload rather than mutating session history by default.

Alternative considered: eagerly detect file writes and refresh diff summaries. That is more expensive, creates noisy state churn, and conflicts with the product decision that fallback review data should be requested on demand.

### Render review as timeline cards plus full-screen drill-downs

Session Detail should show compact cards for changed files, terminal snippets, Markdown artifacts, and generic ACP artifacts. Tapping a card opens a full-screen overlay scoped to that session. The composer and approval sheet remain separate controls; review drill-down is inspection, not a new navigation area.

## Risks / Trade-offs

- ACP update shapes may vary by adapter -> start with conservative normalization, persist unknown supported-looking evidence as `generic`, and keep raw payloads available in structured artifact JSON.
- Large terminal output or diffs can make local storage grow quickly -> store summaries separately, cap initial snippets, and leave room for retention policy work.
- `git diff` can be slow on large repositories -> run it only on user request and surface failures as review endpoint errors.
- Timeline can become noisy if every small update becomes a card -> group artifacts by session and source where possible, and show compact summaries by default.
- A full normalized event model is larger than this change -> persist enough artifact state for reload and realtime updates, while avoiding a broad event replay refactor in this proposal.

## Migration Plan

- Add a SQLite migration for `review_artifacts`.
- Existing sessions will have no review artifacts until new ACP updates arrive or a user opens on-demand diff evidence.
- Rollback is low risk because the new table is additive and existing chat, approval, and session flows can ignore review artifacts.

## Open Questions

- Which exact `codex-acp` update variants should be promoted to typed `diff`, `markdown`, or `terminal` artifacts first?
- Should on-demand `git diff` include unstaged changes only in the first version, or staged plus unstaged?
- Should generated fallback diff artifacts be persisted after viewing, or returned transiently until ACP/file-write evidence is more mature?
