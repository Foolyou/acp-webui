## Why

ACP Web UI can leave a restored session marked `running` after Codex has already finished the prompt turn. The browser then treats follow-up prompts as queued behind active work even though no active turn exists, which makes the session appear stuck.

## What Changes

- Normalize prompt-turn completion so session status, active-turn metadata, and assistant message status are finalized together.
- Prevent permission resolution from marking a session `running` when no active turn exists.
- Repair stale persisted state where a session is `running` or `stopping` without active-turn metadata and no pending approval.
- Keep queued prompts dispatching only after a valid active turn finishes and the session is truly eligible for another prompt.
- Add backend regression coverage for approval/resume edge cases and stale running-state repair.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-session-chat`: tighten prompt-turn and queued-prompt behavior when approvals resolve or stale running state is encountered.
- `session-timeline-data-model`: require completed assistant timeline messages and active-turn metadata to reconcile consistently after turn completion or repair.

## Impact

- Backend session turn lifecycle in `server.go`, `agent.go`, and `storage.go`.
- Session detail/list projections that expose session status, active turn, queued prompts, and timeline message status.
- Startup or read-time repair for inconsistent persisted rows.
- Unit tests covering permission resolution, active turn completion, and stale state repair.
