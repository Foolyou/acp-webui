## Why

ACP supports structured content blocks for prompts and agent output, including images, but the current web UI only accepts and persists plain text. Users need to send visual context to compatible agents and see image content that agents return without losing the existing text timeline behavior.

## What Changes

- Discover and expose each agent runtime's prompt content capabilities, including image support.
- Let users attach supported image files to a session prompt when the selected agent supports image prompt blocks.
- Send prompt text and images to ACP agents as structured `ContentBlock` values.
- Persist user and assistant message content as structured blocks while keeping text content available for existing timeline rendering.
- Render image blocks in session history and realtime timeline updates.
- Keep image support scoped to common browser-safe raster formats and bounded payload sizes.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `agent-runtime-management`: expose discovered prompt content capabilities from initialized agent runtimes.
- `workspace-session-chat`: allow browser prompt submission and agent message display to include supported image content.
- `session-timeline-data-model`: preserve structured message content blocks in persisted and realtime timeline items.

## Impact

- Backend ACP bridge: initialize capability parsing, prompt request construction, session update content parsing.
- Backend storage/API: message schema, prompt payload shape, queued prompt persistence, session detail and websocket events.
- Frontend session UI: composer attachment controls, capability-gated send behavior, timeline image rendering.
- Tests and fixtures: Rust route/ACP tests, TypeScript unit tests, fake ACP and e2e coverage where useful.
