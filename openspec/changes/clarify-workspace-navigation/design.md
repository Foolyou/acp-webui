## Context

The current workbench navigation exposes a primary `Workspaces` route and a secondary `Projects` section that both point to the same `Workspace` records. The routed workspace page also uses `Local projects` as its title. Because desktop and mobile both render the same `WorkbenchNav` structure, this terminology overlap appears in every navigation surface even though there is only one workspace concept in the frontend state and API model.

This change is intentionally narrow. It should clarify navigation roles and copy without changing routes, backend APIs, persistence, or the workspace/session data model.

## Goals / Non-Goals

**Goals:**

- Use one canonical term for the existing workspace entity across navigation and routed page headings.
- Distinguish the full workspace management route from any shortcut list shown in the sidebar or mobile menu.
- Preserve fast workspace switching without introducing a new object type or new backend state.
- Keep desktop and mobile navigation copy aligned so the same route has the same meaning everywhere.

**Non-Goals:**

- Changing workspace ids, APIs, or persistence semantics.
- Adding pinned workspaces, true recents, or user-configurable shortcut ordering.
- Redesigning the broader session workbench layout beyond the navigation clarification needed here.

## Decisions

1. Keep `Workspaces` as the canonical product term.

   The codebase, API surface, and existing OpenSpec capabilities already use `workspace` as the stable concept name. Renaming the routed surface to `Projects` would spread a second vocabulary through specs, types, APIs, and UI copy without adding meaning.

   Alternative considered: Rename the primary surface to `Projects`. This would match the current sidebar label, but it conflicts with the established domain model and makes backend and spec terminology less consistent.

2. Keep the shortcut list, but label it as a workspace subset rather than a second concept.

   The sidebar list is still useful for quick switching, especially on desktop. The problem is not the existence of the list, but that it currently looks like a parallel top-level object model. The shortcut group should therefore use an explicit subset label such as `Workspace shortcuts` and continue linking into workspace-scoped session routes.

   Alternative considered: Remove the shortcut list entirely. That would eliminate duplication, but it would also remove a fast path that the current workbench shell already supports well.

3. Align routed headings and mobile navigation with the same navigation language.

   The routed workspace page should present itself as the workspace management surface, and mobile navigation should not introduce copy that diverges from desktop. Shared labels should come from one place or one coherent structure so future edits do not reintroduce drift.

   Alternative considered: Update only the desktop sidebar copy. This would leave the mobile menu and page headings inconsistent, which preserves the underlying confusion.

## Risks / Trade-offs

- `Workspace shortcuts` is less marketing-friendly than `Projects` -> Prefer explicitness because this surface is a navigation affordance, not a branded feature area.
- Keeping the shortcut list means some visual repetition remains -> Mitigate by making the route-level `Workspaces` item clearly about management and the shortcut list clearly about direct access.
- Reusing the existing first-six workspace slice may not imply recency -> Avoid labels such as `Recent workspaces` unless the product later defines real recency ordering.

## Migration Plan

1. Update the sidebar and mobile navigation labels and grouping.
2. Update the routed workspace page heading to match the canonical workspace terminology.
3. Update any UI or browser test assertions that depend on the old labels.
4. Verify that route targets and active navigation behavior are unchanged.

## Open Questions

- None. The change can proceed with the existing workspace ordering and routing behavior.
