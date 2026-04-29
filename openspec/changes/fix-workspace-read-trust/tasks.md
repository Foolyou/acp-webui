## 1. ACP Filesystem Read Capability

- [ ] 1.1 Advertise ACP client filesystem read-text capability during runtime initialization without advertising write support.
- [ ] 1.2 Add JSON-RPC handling for ACP read text file requests from agents.
- [ ] 1.3 Resolve each read request's ACP session id to the owning local session and persisted workspace path.

## 2. Workspace Trust Boundary

- [ ] 2.1 Canonicalize the session workspace root before evaluating read requests.
- [ ] 2.2 Normalize relative read paths against the session workspace and canonicalize existing target files.
- [ ] 2.3 Return file content only when the canonical target is inside the canonical workspace root.
- [ ] 2.4 Reject outside-root paths, missing session mappings, unreadable files, and symlink escapes with structured ACP errors instead of approval prompts.
- [ ] 2.5 Honor ACP line and limit parameters for successful text reads.

## 3. Permission Option Compatibility

- [ ] 3.1 Extend permission option kinds to include `allow_always` and `reject_always`.
- [ ] 3.2 Allow the backend to resolve any pending agent-provided permission option kind by forwarding its option id to ACP.
- [ ] 3.3 Update the browser approval UI so always options are selectable rather than disabled.

## 4. Verification

- [ ] 4.1 Add backend tests for successful workspace reads without persisted permission requests.
- [ ] 4.2 Add backend tests for outside-root rejection, unknown session rejection, and symlink escape rejection.
- [ ] 4.3 Add tests for line and limit handling in read text file responses.
- [ ] 4.4 Add permission resolution tests for `allow_always` and `reject_always`.
- [ ] 4.5 Run the relevant backend and frontend test suites for the changed areas.
