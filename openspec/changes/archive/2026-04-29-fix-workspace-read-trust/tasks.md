## 1. ACP Filesystem Read Capability

- [x] 1.1 Advertise ACP client filesystem read-text capability during runtime initialization without advertising write support.
- [x] 1.2 Add JSON-RPC handling for ACP read text file requests from agents.
- [x] 1.3 Resolve each read request's ACP session id to the owning local session and persisted workspace path.

## 2. Workspace Trust Boundary

- [x] 2.1 Canonicalize the session workspace root before evaluating read requests.
- [x] 2.2 Normalize relative read paths against the session workspace and canonicalize existing target files.
- [x] 2.3 Return file content only when the canonical target is inside the canonical workspace root.
- [x] 2.4 Reject outside-root paths, missing session mappings, unreadable files, and symlink escapes with structured ACP errors instead of approval prompts.
- [x] 2.5 Honor ACP line and limit parameters for successful text reads.

## 3. Permission Option Compatibility

- [x] 3.1 Extend permission option kinds to include `allow_always` and `reject_always`.
- [x] 3.2 Allow the backend to resolve any pending agent-provided permission option kind by forwarding its option id to ACP.
- [x] 3.3 Update the browser approval UI so always options are selectable rather than disabled.

## 4. Verification

- [x] 4.1 Add backend tests for successful workspace reads without persisted permission requests.
- [x] 4.2 Add backend tests for outside-root rejection, unknown session rejection, and symlink escape rejection.
- [x] 4.3 Add tests for line and limit handling in read text file responses.
- [x] 4.4 Add permission resolution tests for `allow_always` and `reject_always`.
- [x] 4.5 Run the relevant backend and frontend test suites for the changed areas.
