## Context

The Go backend already stores local sessions with a workspace id, agent id, external ACP session id, launch profile metadata, and projected continuity state. The frontend currently enters session work through workspace-scoped routes and calls workspace-scoped list APIs, so a workspace can show sessions from multiple agents together.

Codex ACP exposes native sessions through `session/list` and advertises `loadSession: true`. The native list is owned by the agent runtime, not by the local database, and each returned item includes an external session id, cwd, title, and updated timestamp. That makes the database best suited as a local projection and index, while the ACP external session id remains the continuation key.

## Goals / Non-Goals

**Goals:**

- Make the user-facing workbench hierarchy `workspace > agent > session`.
- Restore the last selected agent when a user enters a workspace.
- Let users switch agents from the workspace sessions surface.
- Start or retry the selected agent runtime when the agent-scoped session list needs native session discovery.
- Import native ACP sessions in the background or on agent-scoped list load without automatically restoring them.
- Keep existing session operations routed by each session's persisted agent id and launch profile metadata.
- Preserve compatibility for old workspace-scoped links during the migration.

**Non-Goals:**

- Remove workspaces from the product model.
- Parse Codex JSONL files as the primary import source.
- Automatically call `session/load` for every imported native session.
- Merge sessions from different agents into one shared conversation.
- Redesign agent launch controls beyond the selection needed to enter an agent-scoped list.

## Decisions

- Use canonical routes under `/workspaces/:workspaceId/agents/:agentId/sessions`.
  - Rationale: the URL directly represents the new product hierarchy and lets Session Detail preserve both workspace and agent context.
  - Alternative considered: keep `/workspaces/:workspaceId/sessions` and store selected agent only in local state. That makes shared links ambiguous and keeps the old workspace-only mental model.

- Store the last selected agent separately from session creation defaults.
  - Rationale: "current agent for navigation" and "last launch profile used for creating a session" are different concerns. Reusing creation profile state would make route restoration depend on unrelated creation controls.
  - Alternative considered: reuse the existing last session profile. That risks changing the visible agent after a user experiments with creation settings without actually switching context.

- Add a backend agent-scoped list endpoint, such as `GET /api/workspaces/{workspaceId}/agents/{agentId}/sessions`.
  - Rationale: selecting an agent may need runtime startup, capability discovery, native list paging, import, and filtered projection. Keeping that as one backend operation prevents the browser from coordinating partially completed state transitions.
  - Alternative considered: have the frontend start the agent, call a sync API, and then call the existing list API. That creates races and exposes implementation ordering to the UI.

- Treat native ACP `session/list` as an import source into the local projection.
  - Rationale: ACP is the source of external sessions, while SQLite is the source for UI projections, local timeline, approval state, and review artifacts. Importing rows makes native sessions navigable and restorable without losing local metadata.
  - Alternative considered: render ACP list results directly without persistence. That would not integrate with existing route ids, continuity projection, review metadata, or future restore state updates.

- Make import idempotent by `(agent_id, external_session_id)`.
  - Rationale: native session ids are scoped to the owning agent. Different agents can use the same external id string, so the uniqueness rule must include agent id.
  - Alternative considered: make `external_session_id` globally unique. That would incorrectly couple independent agent runtimes.

- Import native sessions as non-live local sessions.
  - Rationale: listing should not spend resources restoring every historical session or replaying timelines. A user action should trigger `session/load` for the selected imported session.
  - Alternative considered: automatically load each imported session. That is expensive, changes agent state unexpectedly, and can replay large histories without user intent.

- Use ACP `session/list` only when the selected runtime advertises list support.
  - Rationale: capability discovery already exists and keeps optional ACP methods safe. Agents without list support can still show persisted local rows for the selected workspace and agent.
  - Alternative considered: call `session/list` optimistically and treat method-not-found as capability discovery. That adds avoidable error noise and makes unsupported agents look failed.

- Keep legacy workspace-scoped routes as redirects or compatibility paths.
  - Rationale: existing bookmarks and frontend transitions should not break abruptly. The frontend can redirect to the remembered or default agent route, while backend compatibility can remain for older clients if needed.
  - Alternative considered: remove old routes immediately. That creates avoidable migration risk.

## Risks / Trade-offs

- Agent startup can fail while switching agents. Mitigation: return the persisted workspace-agent list when possible, surface the agent failure through existing status state, and let the user retry by selecting the agent again.
- Native session metadata may be sparse or stale. Mitigation: preserve existing local titles and timestamps when ACP omits fields, and update imported rows only when newer native data is available.
- A workspace may have no remembered agent. Mitigation: choose the first enabled/default configured agent and store it only after navigation succeeds.
- Multiple launch profiles for the same agent can complicate list discovery. Mitigation: use the selected or default compatible launch profile for native list sync, while all existing-session operations continue to use each session's persisted launch profile metadata.
- Import can add many rows at startup. Mitigation: page through ACP results, run startup import asynchronously, and keep route-driven sync scoped to the visible workspace and selected agent.

## Migration Plan

1. Add storage columns and indexes needed for native metadata and idempotent imports.
2. Add storage helpers for listing by workspace and agent and importing/updating native sessions.
3. Add ACP `session/list` runtime support and a manager-level sync helper.
4. Add agent-scoped session list API and preserve the existing workspace-scoped API during transition.
5. Add frontend current-agent state, canonical routes, redirects from legacy workspace routes, and agent switcher behavior.
6. Update Session Detail, session creation, and navigation links to use workspace-agent session routes.
7. Add tests, then enable asynchronous startup import for agents that support list capability.

Rollback can keep the new storage columns unused and route legacy workspace URLs back to the old list API. Imported sessions remain inert local projections unless explicitly restored.

## Open Questions

- Should imported session titles always follow the latest ACP title, or should a future user-editable local title override native updates?
- Should startup import sync every configured workspace or only recently used workspaces before route-driven sync fills the rest?
- Should agent-scoped list responses include a non-fatal warning when runtime startup or native sync fails but persisted rows are still returned?
