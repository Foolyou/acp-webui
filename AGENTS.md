# Repository Guidelines

## Commit Messages

- Use concise imperative sentence case.
- Do not add a trailing period.
- Keep the subject focused on one change.
- Prefer wording consistent with recent history, for example:
  - `Implement initial Codex session flow`
  - `Propose permission approval flow`
  - `Add permission approval flow`
  - `Update session review product design`

## Commit Scope

- Keep implementation, product documentation, and repository guidance in separate commits when they are separate concerns.
- When finalizing an implemented OpenSpec change, amend the related spec sync and archive movement into the implementation commit.
- Commit product design updates separately from application code.
- Commit repository workflow or agent guidance updates separately.
