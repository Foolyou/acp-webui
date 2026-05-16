## Context

ACP prompt turns produce a JSON-RPC `session/prompt` response and a stream of `session/update` events for assistant chunks, tool calls, and permission requests. ACP Web UI currently persists three related pieces of state independently: the session status, active-turn metadata, and message status. A restored Codex session can therefore end up with `sessions.status = running`, no `active_turn_started_at`, and a final assistant message still marked `running`.

The user-visible consequence is that the browser shows `Codex is working...` and queues new prompts even though no active turn exists. This was reproduced in a real local database row where the final push completed, no pending approvals remained, and the follow-up prompt was queued behind stale running state.

## Goals / Non-Goals

**Goals:**

- Make active-turn metadata the durable source of truth for whether a prompt turn is busy.
- Ensure turn completion finalizes session status, active-turn metadata, and assistant message status together.
- Ensure permission resolution resumes a turn only when the turn still exists.
- Repair stale persisted running/stopping rows that have no active turn and no pending approval.
- Preserve existing queued prompt behavior for genuinely active turns and approvals.

**Non-Goals:**

- Change ACP protocol behavior or require Codex ACP changes.
- Add a new user-facing queue management workflow.
- Change the visual design of Session Detail beyond reflecting corrected backend state.
- Rewrite the session timeline model or introduce a new event store.

## Decisions

1. Treat `active_turn_started_at` and `active_turn_status` as the durable busy-turn marker.

   Rationale: session status is a coarse projection used for lists and UI labels, while active-turn metadata carries timing and stop state. If status says `running` but no active turn exists, the system cannot show elapsed time or reliably know what work owns queued prompts.

   Alternative considered: continue using `sessions.status` as the primary busy marker and recreate active-turn metadata when it is missing. That would invent turn timing and can incorrectly dispatch queued prompts after stale state.

2. Replace permission-resolution direct status writes with a turn-aware resume helper.

   Rationale: resolving the last permission means the agent may continue the same turn, but only if the backend still has an active turn for that session. A helper can return `waiting_approval`, `running`, or `idle` based on pending approvals and active-turn state.

   Alternative considered: leave permission resolution unchanged and repair later during session detail load. That fixes the display after reload but still emits wrong realtime state and can queue follow-up prompts unnecessarily.

3. Centralize prompt-turn finalization around storage helpers.

   Rationale: any path that completes, stops, fails, or repairs a turn needs to clear active-turn metadata and mark live assistant messages idle. Keeping this logic together reduces the risk that a future path updates only one table.

   Alternative considered: update message status at each call site. That is smaller initially but easy to miss in stop, failure, queued prompt, and repair paths.

4. Add startup repair for stale persisted state and use the same repair behavior in tests.

   Rationale: existing databases can already contain the inconsistent state. Startup repair makes the next daemon launch self-heal without requiring manual SQL or losing the persisted timeline.

   Alternative considered: repair only when loading session detail. That leaves session list rows stale and may keep queued prompts blocked until the affected detail page is opened.

## Risks / Trade-offs

- Repair may mark a genuinely long-running but untracked turn idle. This is acceptable because a running turn without active-turn metadata is already unrecoverable by the current UI; the repair is limited to sessions with no pending approvals.
- Queued prompts behind a repaired stale turn could remain queued. The implementation should either fail queued prompts for terminal/stale turns or leave them visible with a corrected idle session state; it must not dispatch them as if the stale turn completed normally.
- Existing tests may assume `UpdateSessionStatus(..., running)` is enough to represent active work. Those tests should be updated to use active-turn helpers for busy turns.
