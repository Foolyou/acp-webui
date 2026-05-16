## Context

The backend session list projection already includes `session.status`, `activeTurn`, and pending approval metadata. The frontend keeps those fields current through existing realtime events in `sessionList.ts`. The missing behavior is presentation: `SessionsPane` currently renders the status inline with agent and relative time, so running state is not prominent enough while users compare multiple rows.

## Goals / Non-Goals

**Goals:**
- Make active sessions visually distinct in the existing Sessions list.
- Represent running, stopping, and waiting-for-approval states with compact row badges.
- Continue relying on existing list projection and realtime updates.
- Avoid adding noise for idle sessions.

**Non-Goals:**
- Add a new backend field for running state.
- Change session ordering, filtering, or routing.
- Add elapsed timers or detailed active-turn controls to the Sessions list.

## Decisions

- Use frontend-derived row state from existing `SessionListItem` fields. `pendingPermission` or `session.status === "waiting_approval"` maps to `Waiting approval`; `activeTurn.status === "stopping"` or `session.status === "stopping"` maps to `Stopping`; `activeTurn.status === "running"` or `session.status === "running"` maps to `Running`.
- Render active-state labels in the existing `session-badges` area. This keeps the row hierarchy consistent with permission, approval, review, and continuity badges while making active state visually scannable.
- Do not render an active-state badge for idle or unknown inactive statuses. The existing inline status text remains available for full row context.

## Risks / Trade-offs

- Active-state detection could duplicate approval text when a pending permission exists -> use a short `Waiting approval` badge while preserving the detailed approval badge with title and queue count.
- A stopped or failed session may still have stale active-turn data if an event is missed -> prefer explicit `session.status` for inactive statuses and only treat active-turn values as active when they are running or stopping.
