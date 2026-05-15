## Why

Users repeatedly type the same operational prompts for a given project and agent, such as review, test, commit, or release instructions. Storing common prompts by workspace and agent reduces repeated typing while keeping Codex and Claude workflows separate.

## What Changes

- Add workspace-and-agent-scoped prompt templates persisted locally.
- Add backend APIs to list, create, update, delete, and mark use of prompt templates.
- Add a Session Detail composer affordance to open common prompts for the current session's workspace and agent.
- Allow inserting a template into the composer and saving the current composer text as a reusable template.
- Track lightweight usage metadata so recently used prompts can be surfaced without changing prompt submission semantics.

## Capabilities

### New Capabilities

- `workspace-agent-prompt-templates`: Defines prompt template persistence, workspace/agent scoping, lifecycle APIs, and usage tracking.

### Modified Capabilities

- `react-frontend-application`: The browser composer must show current workspace/agent prompt templates and support inserting or saving templates without breaking prompt submission.

## Impact

- SQLite schema migration for prompt templates.
- Storage layer CRUD and usage tracking methods.
- HTTP routes and TypeScript API/types for prompt templates.
- Session Detail composer UI and focused frontend tests.
- Backend storage/route tests and frontend unit/build verification.
