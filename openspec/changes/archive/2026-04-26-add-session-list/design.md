## Context

ACP Web UI currently opens into Inbox or a single Session workflow. The app can create workspaces and sessions, restore the last selected session from browser storage, and open sessions from Inbox when approval is pending. It does not provide a durable browseable Sessions surface, so completed, failed, idle, or running sessions are hard to find unless they are already selected or need approval.

The product design defines primary navigation as Inbox, Sessions, and Settings. This change implements the Sessions surface while leaving Settings for a later change. The backend already persists workspaces, sessions, permission requests, messages, and review artifacts in SQLite, so the list should be derived from existing persisted records rather than introducing a new storage model.

## Goals / Non-Goals

**Goals:**

- Add a Sessions primary navigation area that lists all persisted sessions.
- Provide enough row metadata for mobile triage: workspace, agent, status, last activity, pending approval, and review artifact/change availability.
- Let the user open any listed session detail.
- Keep Inbox focused on sessions that need user attention.
- Keep the existing session creation, prompt, approval, and review detail flows stable.
- Keep the first implementation simple enough to support the current local single-user SQLite model.

**Non-Goals:**

- Adding Settings navigation or configuration UI.
- Adding multi-agent selection or agent management.
- Implementing normalized event replay or a new event store.
- Adding search, filters, grouping, pagination, or archived session management in this first session list.
- Changing ACP session lifecycle semantics or prompt queueing behavior.

## Decisions

1. Add a backend Sessions list endpoint backed by a projection query.

   Rationale: The frontend needs session rows with workspace and state metadata in one call. A dedicated endpoint avoids requiring the browser to fetch every session detail just to build a list and keeps the projection consistent with Inbox.

   Alternative considered: Reuse `/api/workspaces` plus session detail calls. That would be inefficient and would not expose all sessions without adding workspace-scoped session APIs anyway.

2. Shape list items as compact summaries, not full session details.

   Rationale: The Sessions surface should be quick to scan. Full messages and artifact payloads remain in Session Detail and review drill-down APIs.

   Alternative considered: Return complete session detail for every row. That increases payload size and couples list rendering to timeline data unnecessarily.

3. Derive last activity from persisted session timestamps for the first version.

   Rationale: Existing session records already have `updatedAt`. This is enough for initial ordering and display. A later normalized event model can refine last activity using event timestamps.

   Alternative considered: Compute last activity from latest message, permission, or artifact timestamp. That may be more precise but adds query complexity before the internal event model exists.

4. Represent review availability as counts/flags.

   Rationale: The row needs to signal that review evidence is available without fetching artifact details. A count of review artifacts and a boolean for on-demand diff availability are sufficient for the first version.

   Alternative considered: Include artifact titles in list rows. That risks making mobile rows noisy and duplicates Session Detail timeline responsibilities.

5. Change primary frontend navigation to Inbox and Sessions now, with Settings deferred.

   Rationale: Product design wants Inbox / Sessions / Settings, but this change is specifically scoped to the session list. Shipping Inbox / Sessions avoids keeping the old singular Session nav while not introducing a placeholder Settings surface.

   Alternative considered: Add a disabled Settings tab immediately. That creates nonfunctional navigation and should wait for the Settings change.

## Risks / Trade-offs

- [Risk] Session list projection can drift from Inbox/session detail status semantics -> Mitigation: derive rows from the same persisted session and permission tables used by existing endpoints.
- [Risk] Rows become too dense on mobile -> Mitigation: keep primary text to workspace plus status, and use compact badges for approval and review availability.
- [Risk] Running sessions become stale without realtime updates -> Mitigation: update visible session rows when existing `session_status`, `permission_requested`, `permission_resolved`, and `review_artifact` WebSocket events arrive, and refresh the list when opening the Sessions view if needed.
- [Risk] Lack of pagination could become slow with many sessions -> Mitigation: order by recent activity and leave pagination/filtering as a later enhancement once real volume is known.
