## Why

Users can already attach images to prompts through the explicit image picker, but common desktop workflows also use clipboard paste and drag-and-drop. The composer should accept those image inputs and let users inspect attached images before sending them.

## What Changes

- Allow users to paste supported image files from the clipboard into the prompt composer as image attachments.
- Allow users to drag supported image files onto the prompt composer as image attachments.
- Preserve existing image attachment validation for MIME type, file size, unsupported agent capabilities, and disabled composer states.
- Allow users to open an attached image preview from the composer before sending, without losing the current prompt draft or attachments.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `workspace-session-chat`: Add composer requirements for pasted and dropped image attachments and pre-send image preview.
- `react-frontend-application`: Add frontend behavior and regression coverage expectations for composer paste/drop image attachment and preview interactions.

## Impact

- Frontend session composer image attachment event handling and local preview state.
- Frontend styling for drag focus/drop affordance and image preview modal.
- Frontend tests for composer image input interactions.
- No backend API or storage changes are expected; submitted image content continues to use existing prompt `contentBlocks`.
