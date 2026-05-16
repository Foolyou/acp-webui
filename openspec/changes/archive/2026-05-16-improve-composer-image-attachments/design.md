## Context

Session Detail already owns prompt composition, image attachment state, attachment validation, and prompt submission. Existing image picker input converts selected files into `MessageContentBlock` image blocks, so paste and drag-and-drop can reuse the same local browser conversion path without changing backend APIs.

Composer attachment thumbnails are currently passive previews with a remove action. Users need a larger pre-send inspection path, but this preview is different from persisted review artifact drill-down because it operates entirely on unsent local state.

## Goals / Non-Goals

**Goals:**

- Reuse the existing image attachment validation and conversion path for file picker, paste, and drag-and-drop inputs.
- Keep pasted or dropped images local to the composer until the user sends the prompt.
- Provide a focused pre-send image preview for composer attachments.
- Preserve draft text, queued prompt behavior, skill autocomplete, prompt templates, voice input, and disabled-state behavior.

**Non-Goals:**

- Add new backend upload endpoints or persistent attachment storage.
- Add non-image attachments.
- Add image editing, annotation, or reordering.
- Change persisted review artifact image preview behavior.

## Decisions

1. Centralize attachment ingestion in one composer helper.

   The composer will expose one local `addImageFiles(files)` path used by the existing file picker plus paste and drop handlers. This keeps MIME, size, capability, and error handling consistent.

   Alternative considered: implement separate paste and drop handlers that each call `readImageAttachment` directly. That risks drifting validation and error messages as the composer evolves.

2. Attach paste and drop handling to the composer surface.

   Paste handling should inspect clipboard image files and only prevent the default paste behavior when at least one image file is accepted for ingestion. Drag/drop should prevent browser navigation while files are dragged over or dropped on the composer and should add only image files through the shared path.

   Alternative considered: attach global document-level drop handling. That would make the whole app a drop target and could interfere with other future file workflows.

3. Use a local composer image preview modal.

   Clicking an attachment thumbnail will open a modal backed by the existing in-memory attachment data URL. Closing the modal must not clear the draft or attachments. A local modal avoids overloading review artifact APIs and keeps the interaction scoped to unsent composer state.

   Alternative considered: reuse `ReviewOverlay`. That component is coupled to persisted review artifact metadata and fetch flow, while composer attachments do not have artifact ids or server payloads.

## Risks / Trade-offs

- Browser clipboard APIs vary by source application and platform -> Use `clipboardData.files` plus file-like `clipboardData.items` and keep the explicit Image button as the reliable fallback.
- Dragging unsupported files could accidentally navigate the browser -> Prevent default drag-over/drop behavior only on the composer surface and show a readable validation error when dropped files are unsupported.
- Large image previews can crowd the viewport -> Constrain modal image sizing to the viewport and keep the existing thumbnail strip compact.
