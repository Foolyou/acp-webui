## Resume Investigation

Date: 2026-04-27

## Commands Checked

- `codex-acp --help`
- `codex resume --help`

## Findings

`codex-acp --help` exposes configuration overrides only. It does not document a resume subcommand or an ACP JSON-RPC method for resuming an existing Codex session.

`codex resume --help` exists on the interactive Codex CLI. It accepts an optional `SESSION_ID` argument or `--last`, and it describes the argument as a conversation/session id UUID or thread name. That capability is CLI-facing and does not prove that the ACP process can resume the same context through the current `session/new` and `session/prompt` protocol surface.

The current Web UI stores a local `acp_session_id` returned by `session/new`, but the backend runtime keeps the live ACP-to-local session mapping in memory. After backend restart, a persisted `acp_session_id` alone is not enough evidence that the Codex ACP process can continue the same model/tool context.

## Decision

Persisted sessions remain readable through SQLite history, but the backend marks them not continuable unless it has live runtime context or a future verified ACP resume contract.

## Follow-up

Before implementing real resume, verify whether `codex-acp` supports a stable JSON-RPC method for resuming a Codex transcript, which identifier it requires, and whether that identifier can be safely stored alongside the local Web UI session id.
