## 1. Data Model And API Contract

- [x] 1.1 Add a SQLite migration for `sessions.permission_mode` with existing rows defaulted to `manual`.
- [x] 1.2 Add Rust permission mode constants/types and include permission mode in session, session detail, and session list API models.
- [x] 1.3 Update storage create/read/list queries and row mapping to persist and project permission mode.
- [x] 1.4 Extend `CreateSessionRequest` with optional `permissionMode`, default missing values to `manual`, and reject unknown modes.
- [x] 1.5 Expose per-agent supported permission mode metadata in app state or session creation metadata.

## 2. Runtime Management

- [x] 2.1 Extend agent runtime identity so mode-sensitive runtimes are keyed by agent id and permission mode.
- [x] 2.2 Route session creation, prompts, restores, permission resolution, and cancellation through the runtime matching the session's persisted agent id and permission mode.
- [x] 2.3 Keep retry and status handling independent when one agent has multiple permission-mode runtimes.
- [x] 2.4 Preserve current manual-mode behavior for existing Codex and Claude sessions.

## 3. Codex Mode Mapping

- [x] 3.1 Verify the installed `codex-acp` config override keys for Codex full-auto and YOLO behavior.
- [x] 3.2 Add centralized Codex launch argument construction for `manual`, `full_auto`, and `yolo`.
- [x] 3.3 Ensure `manual` uses the configured base command and args unchanged except for existing user-provided configuration.
- [x] 3.4 Ensure `full_auto` starts a low-friction sandboxed Codex runtime.
- [x] 3.5 Ensure `yolo` starts a Codex runtime that bypasses approvals and sandboxing and is reported as YOLO.

## 4. Frontend

- [x] 4.1 Add TypeScript types for session permission mode and per-agent supported mode metadata.
- [x] 4.2 Add session creation controls for supported permission modes, including clear YOLO warning copy.
- [x] 4.3 Submit the selected permission mode through the session creation API.
- [x] 4.4 Render persistent permission mode indicators in Session Detail and Sessions list, with YOLO visually distinct from manual mode.
- [x] 4.5 Keep permission mode immutable in existing Session Detail; do not render a mode-switching control.
- [x] 4.6 Update approval UI/tests and stale copy so `allow_always` and `reject_always` are treated as selectable agent-provided options.

## 5. Documentation And Spec Alignment

- [x] 5.1 Update README current scope and testing notes to reflect supported permission modes and selectable always options.
- [x] 5.2 Update product design notes to resolve the YOLO scope open question as session-scoped for this version.
- [x] 5.3 Ensure archived or active OpenSpec references used by current docs no longer claim always options are disabled.

## 6. Tests And Verification

- [x] 6.1 Add Rust storage and route tests for default mode, explicit mode, unsupported mode, and migrated sessions.
- [x] 6.2 Add runtime manager tests that prove Codex runtimes are isolated by permission mode.
- [x] 6.3 Add fake ACP coverage for mode-specific Codex launch args without requiring real unsafe execution.
- [x] 6.4 Add frontend unit tests for permission mode selection, unsupported mode hiding, and persistent mode indicators.
- [x] 6.5 Add Playwright coverage for creating manual and YOLO sessions, seeing YOLO indicators after reload, and preserving existing approval flow behavior.
- [x] 6.6 Run backend tests, frontend tests, lint, build, and relevant E2E coverage.
