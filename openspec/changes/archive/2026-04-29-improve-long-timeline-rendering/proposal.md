## Why

Long session timelines can make prompt input visibly laggy because the browser reflows a large timeline while the composer updates. This matters now because restored and active sessions can accumulate enough Markdown and tool output for normal typing to feel delayed.

## What Changes

- Update the Session Detail timeline layout so long rendered timelines do not make the prompt composer lag during typing.
- Add browser-level performance regression coverage for typing into the prompt composer with a large persisted timeline.
- Preserve the current timeline semantics, visual ordering, sticky composer behavior, Markdown rendering, and scroll-follow behavior.
- Do not introduce timeline virtualization, lazy rendering of long content, or new frontend dependencies in this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-session-chat`: The session detail timeline must keep prompt input responsive when rendering long session history.
- `react-frontend-application`: Browser automation must cover the long-timeline prompt input responsiveness regression.

## Impact

- Affected frontend code: `frontend/src/style.css` and the session detail rendering surface if needed to preserve layout behavior.
- Affected tests: Playwright E2E coverage under `frontend/e2e/`.
- No backend API, database, ACP protocol, or packaging changes.
- No new runtime dependencies.
