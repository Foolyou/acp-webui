## 1. Inline Approval

- [x] 1.1 Move pending approval rendering from the shell modal into Session Detail.
- [x] 1.2 Render the active approval with tool summary, decision options, and queued approval count.
- [x] 1.3 Keep approval decisions wired to the existing resolve action.

## 2. Composer And Queue States

- [x] 2.1 Keep the composer visible but disabled while waiting for approval.
- [x] 2.2 Preserve queued prompt ordering and display behind active work.
- [x] 2.3 Prevent prompt submission while approval is pending.

## 3. Stop Behavior

- [x] 3.1 Add an optional `clearQueuedPrompts` cancel request parameter.
- [x] 3.2 Add storage support for explicitly clearing queued prompts from the pending queue.
- [x] 3.3 Add UI confirmation when stopping a turn with queued prompts.
- [x] 3.4 Refresh current session, session list, and queue state after cancel choices.

## 4. Review Viewer

- [x] 4.1 Ensure review artifact actions continue to open the unified full-screen viewer.
- [x] 4.2 Add or adjust viewer rendering for the required evidence kinds without adding side-by-side mobile diff.

## 5. Verification

- [x] 5.1 Add focused frontend tests for inline approval and disabled composer behavior.
- [x] 5.2 Add backend/storage tests for cancel with and without queued prompt clearing.
- [x] 5.3 Run focused frontend and Go tests for approval, queue, review, and cancel behavior.
