# Repository Guidelines

## Commit Messages

- Use concise imperative sentence case.
- Do not add a trailing period.
- Keep the subject focused on one change.
- Provide a concise commit title, and include a richer commit body when the rationale, scope, or follow-up context is useful.
- Prefix bug fix commits with `fix:`.
- Prefix internal specification and OpenSpec changes with `spec:`.
- Prefix external user-facing documentation changes with `doc:`.
- Use a clear conventional prefix for other categories, such as `feat:`, `refactor:`, `test:`, `chore:`, or `style:`.
- Prefer wording consistent with recent history, for example:
  - `feat: implement initial Codex session flow`
  - `spec: propose permission approval flow`
  - `fix: reuse existing workspaces`
  - `doc: update public setup guide`

## Commit Scope

- Keep implementation, product documentation, and repository guidance in separate commits when they are separate concerns.
- When finalizing an implemented OpenSpec change, amend the related spec sync and archive movement into the implementation commit.
- Commit product design updates separately from application code.
- Commit repository workflow or agent guidance updates separately.
