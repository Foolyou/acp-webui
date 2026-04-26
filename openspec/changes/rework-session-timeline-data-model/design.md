## Context

The backend currently persists sessions, messages, permission requests, and review artifacts in separate tables. Session Detail returns messages and review artifacts separately, while the frontend merges them by timestamp. ACP tool updates are normalized into review artifacts, which makes every tool event look like review evidence and prevents the UI from showing simple compact tool activity rows. The runtime also keeps the ACP session mapping in memory, so persisted sessions may remain visible after a backend restart even when they are no longer safe to continue.

This change establishes a backend-owned timeline contract before the UI redesign depends on it.

## Goals / Non-Goals

**Goals:**

- Return a normalized session timeline as the primary Session Detail projection.
- Persist structured tool call timeline items with status, summary, payload, timestamps, and optional artifact links.
- Expose workspace-scoped session list APIs for routed navigation.
- Expose session continuity metadata so old sessions can be clearly view-only when ACP context is unavailable.
- Preserve review artifacts as detailed evidence and drill-down payloads.
- Investigate Codex ACP resume support as a spike, without promising resume behavior in this change.

**Non-Goals:**

- Redesigning the frontend layout or visual system.
- Implementing Codex resume unless the spike proves there is a stable ACP contract and a follow-up change accepts that scope.
- Adding ordinary running-turn cancellation.
- Replacing SQLite with another persistence system.

## Decisions

1. Make the backend the owner of timeline ordering.

   Session Detail should return ordered `timeline` items instead of requiring the frontend to merge messages, review artifacts, permissions, and tool updates. This keeps reload behavior, realtime reconciliation, and list/detail consistency in one place.

   Alternative considered: Keep separate arrays and improve frontend merging. That would avoid API churn but would preserve the core ambiguity around ordering, item identity, and tool call presentation.

2. Add structured tool calls as first-class persisted timeline items.

   ACP `tool_call` and `tool_call_update` events should create or update tool call records with a stable local id, optional ACP tool call id, kind/name, summary, status, timestamps, payload, and output summary when available. Review artifacts can link to the tool call when a diff, markdown, terminal output, or other evidence belongs to it.

   Alternative considered: Continue storing every non-text update as a review artifact. That makes full payloads available, but it overloads review artifacts and produces noisy timelines.

3. Expose continuity explicitly.

   Session projections should include `continuable: boolean` and nullable `viewOnlyReason`. A session is continuable only when the backend has enough ACP runtime context to send another prompt. Persisted history remains readable even when continuation is disabled.

   Alternative considered: Let prompt submission fail only when attempted. That is simpler but creates a confusing UI where old sessions look editable until the user hits an error.

4. Scope session lists by workspace while retaining a compatibility path if needed.

   The new contract should support `GET /api/workspaces/:workspace_id/sessions` as the primary list route. A global list may remain temporarily for compatibility, but the workbench UI should use workspace-scoped data.

   Alternative considered: Keep only the global session list. That does not match the desired navigation hierarchy and forces the frontend to filter client-side.

5. Treat Codex resume as an investigation.

   The CLI exposes `codex resume`, but the current ACP integration only uses `session/new` and `session/prompt`. This change should document and test current behavior, then add a spike result before any future implementation relies on resume.

   Alternative considered: Attempt to invoke CLI resume or infer transcript paths immediately. That would couple the app to unstable implementation details.

## Risks / Trade-offs

- API churn for the frontend -> Introduce TypeScript models and update E2E coverage with the normalized timeline contract.
- Migration complexity -> Keep existing messages and review artifacts, add timeline/tool structures incrementally, and derive timeline rows for existing message/artifact data.
- ACP update ambiguity -> Store raw payloads alongside normalized summaries so unsupported fields are not lost.
- View-only sessions may feel limiting -> Provide clear `viewOnlyReason` and a path to create a new session in the UI change.
- Resume spike may not find a usable ACP path -> Capture the result in follow-up docs/tasks rather than blocking this data model change.

## Migration Plan

1. Add migrations for tool call persistence and any timeline metadata needed for stable ordering.
2. Backfill or derive timeline rows from existing messages and review artifacts without deleting current data.
3. Add new API response shapes while tests still cover existing user-visible history.
4. Update realtime events to carry timeline item upserts for new tool activity.
5. Mark non-continuable persisted sessions explicitly after backend restart when ACP mappings are unavailable.
6. Keep rollback simple by leaving existing message and review artifact tables intact.

## Open Questions

- Whether `codex-acp` exposes a stable resume method or only the interactive CLI does.
- Whether timeline item ids should be globally unique UUIDs for all item kinds or kind-prefixed ids derived from backing rows.
