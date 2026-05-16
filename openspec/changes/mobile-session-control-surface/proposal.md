## Why

Session Detail is the core remote-control surface, but approvals are currently presented as a modal sheet and stopping active work does not distinguish queued follow-up prompts. The mobile controller needs stable inline context for approvals, queued prompts, review evidence, and cancel choices.

## What Changes

- Replace the session approval modal with a prominent sticky inline approval panel inside Session Detail.
- Keep the prompt composer visible but disabled while a permission approval is pending.
- Keep queued prompts as a deliberate remote-control feature, while preventing additional queued prompts during pending approval.
- Ask whether to clear queued prompts when stopping active work that has queued follow-ups.
- Keep review evidence session-scoped and open evidence in the unified full-screen review viewer.
- Show only the active pending approval with a queued approval count.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `workspace-session-chat`: Session Detail layout, composer disabled state, queued prompt display, and stop behavior.
- `agent-permission-approval`: Approval decisions move from a modal sheet to a sticky inline panel.
- `session-review-artifacts`: Review evidence remains session-scoped and opens in the unified review viewer.
- `session-list`: Session cards may show queued prompt and review evidence badges as secondary status.

## Impact

- Frontend Session Detail and approval components.
- Backend cancel request shape and queued prompt clearing behavior.
- Storage helper for explicitly clearing queued prompts.
- Unit and e2e coverage for approval, composer, and cancel choices.
