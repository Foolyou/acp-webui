# Go Backend Migration Audit

This document tracks parity work between the Rust mainline backend and the Go backend port.

## Scope

- Source baseline: Rust mainline backend behavior as implemented in `src/acp.rs`, `src/routes.rs`, and `src/storage.rs`.
- Target: Go backend port on branch `go-backend-port`.
- Compatibility requirement: existing SQLite databases created by the Rust/sqlx backend must open and migrate cleanly under the Go backend without losing session history, permissions, queued prompts, tool calls, review artifacts, prompt templates, or restore state.

## Migration Policy

- The Go backend uses the same numbered SQL files as the Rust backend.
- Rust/sqlx records applied migrations in `_sqlx_migrations`; the Go port records them in `schema_migrations`.
- On first Go startup against an old Rust database, the Go backend imports successful `_sqlx_migrations` rows into `schema_migrations` before running any remaining migrations.
- Startup repair preserves pending approval semantics: pending approvals expire with a system message and the affected sessions move to `failed`; only restored running sessions without pending approvals are repaired to `idle`.
- Workspace paths are canonicalized and stored in native platform form to keep idempotency with Rust-created workspaces.

## Gap List

| ID | Area | Mainline behavior | Go port gap | Status |
| --- | --- | --- | --- | --- |
| MIG-001 | SQL migration state | Rust records `_sqlx_migrations`; Go must recognize it. | Go only checked `schema_migrations`, causing old databases to rerun migrations and fail on non-idempotent DDL such as `0012_prompt_templates.sql`. | Fixed |
| MIG-002 | Workspace storage | Canonicalizes path, verifies it is a directory, and stores native path string. | Go stored the submitted string directly. | Fixed |
| MIG-003 | Startup pending approvals | Expires each pending approval, marks affected sessions `failed`, and adds a system message. | Go only expired permission rows. | Fixed |
| MIG-004 | Startup session repair | Repairs only `restored` sessions stuck in `running` with no pending approvals. | Go repaired all running/stopping/waiting sessions and cleared active turns. | Fixed |
| ACP-001 | Runtime status by permission mode | Each permission mode reports the status of its default launch profile. Legacy `connection_status` is Codex manual only. | Go reported one runtime status for all modes and emitted legacy status for all Codex modes. | Fixed |
| ACP-002 | Prompt validation/order | Runtime is resolved and image capability checked before persisting a new user message or active turn; image MIME/size limits are enforced. | Go persisted message/active turn before runtime start and lacked prompt image validation. | Fixed |
| ACP-003 | Assistant/tool interleaving | Live assistant chunks are persisted as a running assistant message, flushed to idle before tools, permissions, and display images. | Go buffered text only in memory and lost chunks on reload/crash before final flush. | Fixed |
| ACP-004 | Restore replay | `session/load` replay is persisted only for empty local histories, deduped, and registered only after successful load. | Go registered before load and dropped replayed history. | Fixed |
| ACP-005 | Tool update protocol | Handles `tool_call` and `tool_call_update`; normalizes id/title/kind/status and persists review artifacts only when evidence exists. | Go only handled `tool_call`, defaulted status to completed, and created broad duplicate artifacts. | Fixed |
| ACP-006 | Image evidence | Explicit `display_image` tool calls and image paths in tool output create/upsert image review artifacts. | Go supported direct display-image request but not tool update/path enrichment parity. | Fixed |
| ACP-007 | Permission lifecycle | Permission creation updates session status and broadcasts status; resolving emits status and active queue state. | Go was missing some status broadcasts and queue state parity. | Fixed |
| ACP-008 | JSON-RPC permission response ids | Permission responses preserve the original JSON-RPC id value and type. | Go converted numeric request ids into string response ids. | Fixed |
| UI-001 | Approval-time prompt queueing | Composer remains enabled so follow-up prompts can queue behind approval. | Go port frontend disabled composer during approval. | Fixed |

## Verification Checklist

- Passed: `go test ./...`
- Passed: `npm run test` in `frontend`
- Passed: `npm run build` in `frontend`
- Passed: `npm run e2e -- --project=mobile-chromium`
- Passed: `ACP_WEBUI_REAL_CODEX_E2E=1 npm run e2e:real-codex -- --project=mobile-chromium`
- Covered: old-style SQLite migration fixture with `_sqlx_migrations` and current schema runs through Go `Migrate`.
- Covered: startup approval expiry and restored-running repair.
- Covered: assistant/tool interleaving, restore replay, tool update artifacts, and prompt image validation.
- Covered: permission JSON-RPC response id type preservation.
