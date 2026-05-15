# Go Port Browser QA

Date: 2026-05-11

## Scope

- Pairing-token gate and anonymous browser flow
- Workspace creation and workspace session list navigation
- Real Codex session creation through `codex-acp`
- Prompt submission, streaming updates, persisted timeline restore, and refresh behavior
- Manual, full-auto, and YOLO permission modes
- Permission approval overlay, inbox routing, allow-once, reject, and always options
- Session config/model selector behavior while idle and while a turn is active
- Long timeline rendering, Markdown rendering, image/tool/review artifact display, and overlay layout
- Embedded frontend release smoke coverage

## Issue Log

| ID | Status | Area | Finding | Fix | Verification |
| --- | --- | --- | --- | --- | --- |
| QA-001 | Fixed | Real ACP session start | Real `codex-acp` rejected Go-port `session/new` with `Invalid params` because the Go request omitted the ACP `mcpServers` field and did not advertise the same client capabilities as the Rust runtime. | Added ACP initialize capability metadata, session `mcpServers` for new/load flows, and client handlers for `fs/read_text_file` and `display_image`. | `ACP_WEBUI_REAL_CODEX_E2E=1 npm run e2e:real-codex` passed with a real Codex session, real reply, refresh restore, and session-list navigation. |
| QA-002 | Fixed | Real ACP turn submission | A newly created fast-mode Codex session could fail on first prompt with `internal error` because real `codex-acp` rejected `reasoning.effort=minimal` when `image_gen` and `web_search` tools were available. | Mapped fast mode and legacy `minimal` launch profiles to `model_reasoning_effort="low"` and removed `Minimal` from new-session launch controls. | Added Go coverage for fast-mode and legacy-minimal argument generation, then updated and re-ran real `codex-acp` e2e against `Response mode = Fast`. |
| QA-003 | Fixed | Timeline ordering | Assistant text chunks were buffered until the whole prompt ended, so tool calls were persisted earlier than all assistant text and the UI grouped tools and messages into separate large cards instead of interleaving them by event time. | Flush active assistant text before tool calls, permission requests, and display-image artifacts, then flush the remaining text at turn completion. Replay chunks outside an active prompt remain ignored. | Added Go runtime coverage for `message -> tool -> message` ordering and browser e2e coverage for an interleaved fake ACP turn. |

## Final Verification

- `go test . ./migrations`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run e2e` (fake ACP browser regression suite; real Codex spec skipped by default)
- `ACP_WEBUI_REAL_CODEX_E2E=1 npm run e2e:real-codex`
- `.\scripts\smoke-embedded-frontend.ps1 -SkipBuild`

No unresolved QA issues remain in this pass.
