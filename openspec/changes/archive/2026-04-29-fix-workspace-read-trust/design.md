## Context

ACP sessions already receive the selected workspace path as `cwd`, but the backend initializes agents with empty client capabilities and only handles `session/update` plus `session/request_permission`. When an agent wants file contents, it must use its own tools, which can produce permission prompts even for files that are inside the workspace the user explicitly opened.

Zed separates these concerns. Worktree trust establishes which project roots are trusted, while ACP client filesystem capabilities provide a controlled way for external agents to ask the editor to read project files. Normal project reads do not prompt; paths outside the project are rejected or gated by additional checks, and tool approvals remain available for writes, shell commands, and other risky actions.

## Goals / Non-Goals

**Goals:**
- Treat the session workspace root as the trusted read boundary for that session.
- Let ACP agents read text files inside that root without creating permission requests.
- Reject reads outside the trusted root, including symlink escapes, unless a later change adds an explicit approval flow.
- Preserve existing permission handling for shell, write, delete, network, and other agent-requested approvals.
- Support agent-provided always permission options so Codex and Claude flows can match their native CLI behavior more closely.

**Non-Goals:**
- Auto-approve shell commands that happen to read workspace files.
- Add client-side file write capability.
- Add multi-root workspace configuration beyond the existing single persisted workspace path.
- Implement private-file or ignore-pattern policy beyond the workspace-root boundary.

## Decisions

1. Advertise read-only ACP filesystem capability.

   The backend will advertise client filesystem read support during `initialize`. It will not advertise write support in this change. This gives compatible agents a safe, structured read path while keeping mutations under the existing permission model.

   Alternative considered: configure each agent CLI to bypass approvals for workspace reads. That is less reliable because shell-based reads and agent-native tools do not give the web backend a precise path boundary to enforce.

2. Resolve ACP read requests through the owning session workspace.

   Incoming ACP file read requests will use the ACP session id to find the local session and workspace. The requested path will be normalized and canonicalized relative to that workspace when needed, then allowed only when the canonical target remains under the canonical workspace root.

   Alternative considered: trust any path because the agent process was launched with `cwd`. That matches a fully trusted local process, but it does not give the web UI a meaningful workspace trust boundary.

3. Reject symlink escapes by default.

   If a requested path appears under the workspace but canonicalizes outside it, the backend will reject the read. This mirrors Zed's distinction between normal project files and symlink escapes while avoiding a new approval surface in the first implementation.

   Alternative considered: prompt for symlink escapes. That is viable later, but it requires new UI copy and request classification so users understand the canonical external target.

4. Treat always permission options as supported ACP choices.

   Permission options will remain agent-provided and option-id based. The backend will allow selection of `allow_always` and `reject_always` options rather than disabling them, then forward the selected option id back to the agent.

   Alternative considered: keep always options disabled until a local persistence model exists. That prevents agents that already own their permission memory from exposing their native experience through the web UI.

## Risks / Trade-offs

- ACP method naming or payload shape differs between agents. Mitigation: add protocol-focused tests that exercise raw JSON-RPC request handling with the observed ACP fields before enabling the capability.
- Canonicalization can fail for missing files. Mitigation: reads only target existing text files; missing paths return a structured read error rather than prompting.
- Some agents may keep using their own read tools. Mitigation: the new capability is additive; existing permission flow remains available, and agent-specific CLI defaults can be tuned separately later.
- Binary or very large files could produce poor responses. Mitigation: treat this as text-file access, honor line/limit arguments when present, and return clear errors for unreadable content.
