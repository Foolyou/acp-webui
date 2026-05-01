## Why

Agents can create or locate image files, but today they often answer with a
directory or file path, leaving the user to leave the conversation and inspect
the file manually. The session experience should make image-producing work feel
native by giving the agent a clear, model-visible way to ask the UI to display a
workspace image inline.

## What Changes

- Introduce a model-visible `display_image` affordance for agent runtimes that
  can consume MCP-style tools or equivalent client-provided tool metadata.
- Add hidden agent guidance that recommends calling `display_image` whenever an
  agent creates, modifies, locates, screenshots, or otherwise references an
  image the user should inspect.
- Validate requested image paths as workspace-contained files before reading or
  exposing them.
- Persist displayed images as session evidence so they survive reloads and do
  not depend on the original file path remaining unchanged.
- Render displayed image evidence inline in the session timeline and in the
  existing session-scoped artifact drill-down.
- Add a conservative fallback for plain-text workspace image paths so older or
  unaware agents still produce a useful preview when safe.

## Capabilities

### New Capabilities

- `agent-display-image-tool`: Model-visible display-image affordance and
  workspace-safe image display behavior.

### Modified Capabilities

- `workspace-session-chat`: Session prompts include agent guidance for the
  display-image affordance.
- `session-review-artifacts`: Session review artifacts support image evidence.
- `session-experience-visual-system`: Session detail renders displayed image
  evidence inline and in drill-down surfaces.

## Impact

- Backend ACP session setup and prompt dispatch, including MCP server metadata
  or equivalent tool affordance injection.
- Backend path validation, image MIME detection, and review artifact creation.
- Session detail API and realtime timeline updates for image evidence.
- Frontend timeline rendering, review artifact rendering, and tests for image
  evidence on desktop and mobile.
