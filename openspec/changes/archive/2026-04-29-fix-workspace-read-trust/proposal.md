## Why

Workspace sessions currently ask for approval when an agent reads files that are already inside the selected workspace. That breaks the expected trust boundary for local coding agents: the workspace root should be the trusted read area, while approvals should remain focused on writes, shell commands, external paths, and other higher-risk actions.

## What Changes

- Add a trusted workspace file access path for ACP sessions so agents can read text files inside the session workspace without creating permission requests.
- Advertise ACP client filesystem read capability during agent initialization and handle agent-initiated read text file requests.
- Canonicalize requested paths and reject reads outside the session workspace root, including symlink escapes unless explicitly handled by a future approval path.
- Keep existing permission approval flows for shell commands, writes, deletes, network access, and other agent-requested operations.
- Allow users to select agent-provided `allow_always` and `reject_always` permission options instead of disabling them in the web client.

## Capabilities

### New Capabilities
- `workspace-file-access`: Defines trusted workspace-scoped ACP file reads for live agent sessions.

### Modified Capabilities
- `agent-permission-approval`: Permission resolution will support all agent-provided option kinds, including `allow_always` and `reject_always`.

## Impact

- Backend ACP runtime initialization and JSON-RPC request handling.
- Workspace/session mappings used to resolve ACP session ids to local workspace roots.
- Permission approval API and browser approval controls for always options.
- Tests for workspace-scoped reads, outside-root rejection, symlink escape handling, and always-option resolution.
