## Context

ACP Web UI already has routed workspace, session list, agent, inbox, and session detail components. The active route model redirects workspace sessions to `/workspaces/:workspaceId/agents/:agentId/sessions`, which makes agent selection feel primary. The decision document sets the opposite product model: workspace first, agent as a filter or session attribute.

## Goals / Non-Goals

**Goals:**

- Make `/workspaces/:workspaceId/sessions` the canonical workspace cockpit.
- Keep existing agent-scoped routes working as compatibility shortcuts.
- Keep workspace attention approval-focused for the first version.
- Make session cards compact and scannable on mobile.

**Non-Goals:**

- Do not add direct approve/reject actions to session cards.
- Do not broaden Inbox to failed, long-running, restore, or queued-prompt states.
- Do not implement the separate New Session compose flow here; that is covered by `workspace-scoped-new-session-compose`.
- Do not implement Settings here; that is covered by `controller-settings-recovery-observability`.

## Decisions

1. Use the workspace session endpoint as cockpit data.
   - Rationale: `/api/workspaces/:workspaceId/sessions` already returns all agents' sessions for a workspace.
   - Alternative considered: keep agent routes and synthesize all-agent state by loading every agent route. Rejected because it makes agent navigation primary and creates unnecessary backend calls.

2. Apply status and agent filters in the browser.
   - Rationale: The first-version dataset is already loaded as a workspace list and filters are presentation state.
   - Alternative considered: add query parameters and server filtering. Deferred until lists become large enough to require server-side filtering.

3. Derive workspace card summaries from available session and inbox projections.
   - Rationale: Existing initial state already loads workspaces, sessions, and inbox; summaries can be computed without a storage migration.
   - Alternative considered: add workspace summary fields to the Workspace API. Deferred until summaries need strict freshness independent of loaded session projections.

4. Preserve agent routes as compatibility routes.
   - Rationale: Existing links, tests, and browser history may point at agent-scoped URLs.
   - Alternative considered: remove agent routes. Rejected because it would create avoidable navigation churn.

## Risks / Trade-offs

- Workspace summaries can be stale if only a scoped session list is loaded later. -> Recompute from the latest available projections and keep summaries lightweight.
- Compatibility routes may still imply agent-first navigation. -> Redirect or render the same cockpit with an agent filter applied instead of exposing separate primary nav.
- More filters add UI density. -> Use compact segmented/select controls and keep defaults at Status: All and Agent: All agents.
