## Context

The current backend already persists normalized timeline items, including structured tool calls, and broadcasts updates through a WebSocket channel. The React frontend renders the timeline and can group tool calls, but completed tool activity can disappear from the visible conversation when grouped or filtered too aggressively. Prompt submission is currently restricted while a turn is running or waiting on approval, and mobile browsers can suspend the page long enough for the WebSocket to stop delivering events without a visible recovery path.

This change crosses backend session state, ACP runtime control, realtime delivery, and Session Detail UI, so the behavior needs to be specified as a single session-control improvement rather than isolated visual fixes.

## Goals / Non-Goals

**Goals:**

- Preserve completed tool call traceability while keeping long runs readable through collapsed consecutive groups.
- Let users submit follow-up prompts while a session is busy by storing them in an ordered queue.
- Let users stop the active turn from the UI and show the resulting session state consistently.
- Surface elapsed active work time in a clear minute/second format.
- Recover realtime state after mobile app switching by reconnecting and reconciling missed persisted timeline data.

**Non-Goals:**

- Supporting parallel execution of multiple queued prompts in the same session.
- Reordering, editing, or partially executing queued prompts.
- Guaranteeing hard process termination when an ACP agent does not expose cancellation for an active request.
- Replacing the existing WebSocket transport with another realtime protocol.

## Decisions

1. Keep normalized timeline items as the source of truth and group only in the frontend display layer.

   Consecutive completed tool call items will be collapsed into a display group with a count and expandable details. Running, failed, approval, review, and message items remain boundaries unless the implementation explicitly chooses to show a single running tool row. This preserves API stability and avoids introducing pre-grouped backend timeline records that would complicate realtime upserts.

   Alternative considered: store tool call group records in the backend. This would reduce frontend grouping work but would make group boundaries dependent on presentation policy and would require additional migration/reconciliation logic.

2. Add a persistent per-session prompt queue managed by the backend.

   Prompt submission while a session is running or waiting for approval will create queued user prompt records rather than returning a blocking error. The backend will dispatch exactly one queued prompt when the current turn reaches an idle, continuable state with no pending approvals. This keeps queue behavior consistent across reloads and devices.

   Alternative considered: keep queueing only in frontend state. That would lose queued prompts on reload and would not work across multiple browser tabs.

3. Model stop as a turn-control request with best-effort ACP cancellation.

   The backend will route stop through the owning agent runtime and mark the current turn as stopping/stopped based on the agent outcome or fallback timeout. If the agent cannot cancel, the backend still records the user stop request and prevents automatic dispatch of queued prompts until the active turn is no longer running.

   Alternative considered: kill and restart the whole runtime for every stop. That is more disruptive, risks losing unrelated sessions for the same agent, and should be reserved as an explicit fallback only if needed.

4. Derive elapsed work time from backend turn timestamps, format it in the frontend.

   The backend should expose active turn start time and status; the frontend can tick locally once per second for display. Persisted timestamps avoid timer resets on reload or reconnect, while frontend formatting avoids unnecessary realtime chatter.

   Alternative considered: broadcast elapsed seconds every second. That would increase realtime traffic and still need client-side recovery after disconnects.

5. Treat WebSocket reconnect as a reconciliation point.

   On reconnect, visibility return, or online recovery, the frontend will reload the current session detail and then continue applying live events. This handles mobile background suspension where messages were persisted while the browser was inactive.

   Alternative considered: maintain an event cursor and replay missed events over WebSocket. That may be useful later, but reloading persisted session detail is simpler and matches the existing storage-first timeline model.

## Risks / Trade-offs

- Queued prompts can surprise users if they expected a prompt to run immediately -> show queued prompts explicitly with position/count and only dispatch when the session becomes eligible.
- Stop semantics may vary across agents -> expose stopping/stopped/fallback state and keep the UI honest when cancellation is best-effort.
- Reconcile-on-reconnect can briefly replace local optimistic state -> preserve stable item ids and merge by normalized timeline ids.
- Collapsed tool groups can hide important failures -> do not collapse failed or running tool calls into completed-success groups, and show failure counts/status when a group contains non-success completion states.
- Mobile reconnect may duplicate events around the reload boundary -> upsert realtime items by stable ids after reloading session detail.

## Migration Plan

1. Add any required storage fields or tables for queued prompts and active turn timing with default-safe migrations.
2. Extend backend response shapes while preserving existing fields for compatible frontend reads.
3. Implement frontend rendering and controls behind the existing Session Detail route.
4. Add backend and frontend tests for queueing, stopping, elapsed time, grouping, and reconnect reconciliation.
5. Rollback by leaving queued prompt rows inert and restoring the prior prompt rejection behavior if a release must be reverted.
