## Context

The app already supports pending permission requests, queued prompts, session review artifacts, and current-turn stopping. Approval UI is currently mounted from the shell as a modal sheet. Stopping a session calls a single cancel endpoint and leaves no explicit choice for queued prompts.

## Goals / Non-Goals

**Goals:**

- Keep approval decisions in Session Detail near timeline and composer context.
- Keep layout stable by leaving the composer in place when disabled.
- Make queued prompt clearing explicit when stopping active work.
- Preserve review artifact payload fidelity and the existing unified viewer pattern.

**Non-Goals:**

- Do not add approve/reject actions to cockpit cards.
- Do not implement side-by-side mobile diff.
- Do not remove queued prompt support.
- Do not add durable event replay here; recovery is covered separately.

## Decisions

1. Move approval UI into `SessionPane`.
   - Rationale: Approval decisions need timeline and composer context and should not obscure the session on mobile.
   - Alternative considered: keep the modal sheet but make it taller. Rejected because it still disconnects the decision from the timeline.

2. Keep only the active approval actionable.
   - Rationale: Existing backend and realtime projections already expose active and queued approval counts.
   - Alternative considered: render all approvals at once. Rejected because it overloads the mobile control surface and can invite out-of-order decisions.

3. Extend cancel with an explicit `clearQueuedPrompts` option.
   - Rationale: Stopping the active turn and clearing queued follow-ups are distinct user intents.
   - Alternative considered: always clear queued prompts. Rejected because queued prompts are a deliberate remote-control feature.

4. Mark cleared queued prompts as failed/cancelled rather than deleting rows.
   - Rationale: Visible session state should explain what happened and existing queue repair code already treats non-queued statuses as no longer pending.
   - Alternative considered: delete queued rows. Rejected because it loses audit context.

## Risks / Trade-offs

- Inline approval can take vertical space on small screens. -> Use sticky compact styling and keep the timeline scrollable.
- Adding cancel options changes API shape. -> Make the request body optional so existing callers continue to cancel only active work.
- Queue-clearing state labels may need later refinement. -> Preserve current data model and expose a clear UI event/state in Session Detail.
