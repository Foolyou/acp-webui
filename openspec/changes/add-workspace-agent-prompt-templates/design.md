## Context

Prompt submission already flows through Session Detail, the storage layer already persists workspace-scoped sessions, and the frontend composer already supports adjacent affordances such as skill autocomplete and image attachments. Common prompts should behave like local reusable workspace assets, not conversation history, so they need their own table and API surface.

The scoping key is `(workspace_id, agent_id)` because different agents often need different reusable instructions in the same workspace. The first implementation stays text-only even though prompt submission can now send image blocks; content block templates can be added later without changing the basic scope model.

## Goals / Non-Goals

**Goals:**

- Persist text prompt templates locally by workspace and agent.
- Allow Session Detail to list templates for the current session's workspace and agent.
- Let users insert a template into the composer without submitting it immediately.
- Let users save the current composer text as a reusable template.
- Track usage count and last-used timestamp when a template is inserted.

**Non-Goals:**

- Global templates shared across all workspaces.
- Cross-device sync or import/export.
- Template variables, interpolation, folders, permissions, or image/content-block templates.
- Replacing the existing prompt submission and queued prompt behavior.

## Decisions

- Store templates in SQLite with `workspace_id`, `agent_id`, `title`, `body`, optional `tags_json`, `position`, usage metadata, timestamps, and nullable `archived_at`.
  - Rationale: this matches the app's local persistence model and allows soft deletion without losing history immediately.
  - Alternative considered: localStorage-only frontend storage. That would avoid backend work but would not survive browser changes and would bypass the existing single-binary data model.

- Expose workspace/agent list and create routes plus template-id update/delete/use routes.
  - Rationale: list/create are naturally scoped by workspace and agent, while updates operate on a stable template id.
  - Alternative considered: nest all mutations under workspace/agent. That repeats scope parameters and adds more opportunities for mismatched ids.

- Insert templates into the existing composer text area instead of auto-submitting them.
  - Rationale: common prompts often need a small edit before sending, and preserving user control avoids accidental agent work.
  - Alternative considered: one-click submit. That can be added later as a separate explicit action.

- Append inserted text when the composer already has content, separated by a blank line.
  - Rationale: this is predictable and preserves drafts.
  - Alternative considered: replace the composer every time. That risks losing user text.

## Risks / Trade-offs

- Template lists could grow noisy. Mitigation: order by manual position, then recent usage/update timestamps, and soft-delete removed entries.
- Saving duplicates can clutter the list. Mitigation: keep MVP simple and allow users to rename/delete; duplicate detection can be added later.
- Composer UI could become crowded. Mitigation: use a compact `Prompts` button and popover/panel near existing composer actions instead of a permanent list.
- Existing active completed change remains unarchived. Mitigation: keep this change isolated under its own OpenSpec directory and implementation files.
