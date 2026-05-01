## Context

The normalized session timeline already stores ACP tool activity and the React frontend already collapses consecutive completed tool calls. The current failure comes from sparse ACP payloads: when no title or name can be derived, backend display fallback uses a permission-oriented label, and frontend folding treats that label as permission bookkeeping. Those rows are removed before the completed-tool-call grouping pass, so the group never appears.

This change spans backend ACP parsing, frontend display filtering, and display fallback extraction, but it does not require a schema migration because raw input/output and existing title/summary fields remain available.

## Goals / Non-Goals

**Goals:**

- Ensure generic completed ACP tool updates remain visible and groupable even when display metadata is sparse.
- Keep explicit permission request/resolution bookkeeping hidden when a matching approval surface represents the same event.
- Improve displayed detail for sparse ACP payloads using existing raw fields.
- Cover the regression with backend and frontend tests.

**Non-Goals:**

- Redesign the timeline UI or change the collapsed group interaction model.
- Change database schema or rewrite existing persisted tool call records.
- Merge tool groups across message, approval, review, running, or failed timeline boundaries.

## Decisions

- Use neutral backend fallback titles for generic tool calls.
  - Rationale: a missing ACP title is not evidence that the record is permission activity.
  - Alternative considered: keep the backend fallback and special-case only in the frontend. That would preserve future ambiguous data and make other clients inherit the same misleading label.

- Keep permission request fallback separate from generic tool call fallback.
  - Rationale: permission UI can still say "Permission requested" when the permission request payload lacks a command title, while normal tool updates receive a neutral fallback.
  - Alternative considered: remove all permission fallback text. That would make approval prompts less clear.

- Make frontend permission folding require an explicit permission/approval kind.
  - Rationale: title text alone is too weak to classify a tool row as bookkeeping. Explicit kind data is a safer signal and avoids hiding existing persisted rows with misleading titles.
  - Alternative considered: disable permission folding entirely. That would reintroduce duplicate permission rows next to approval UI.

- Improve display extraction from raw ACP payload content without changing API shape.
  - Rationale: existing raw input is enough to recover command or subject hints for many updates, and optional client-side extraction avoids migration risk.
  - Alternative considered: add new backend projection fields. That can be revisited later, but this fix can stay smaller and backward-compatible.

## Risks / Trade-offs

- Existing permission bookkeeping with non-explicit kinds may become visible. Mitigation: keep linked permission records folded first and preserve folding for explicit permission/approval kinds.
- Sparse tool rows may still have generic labels when raw payloads contain no useful content. Mitigation: render the group count and raw-detail affordance so history remains visible and inspectable.
- Existing persisted rows with misleading titles remain in the database. Mitigation: the frontend classification fix makes those rows visible without requiring a data migration.
