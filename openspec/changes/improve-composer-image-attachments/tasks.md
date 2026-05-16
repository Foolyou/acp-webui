## 1. Attachment Ingestion

- [x] 1.1 Centralize composer image file ingestion so file picker, paste, and drop inputs share validation and error handling
- [x] 1.2 Add clipboard paste handling for supported image files without breaking normal text paste behavior
- [x] 1.3 Add composer drag-over and drop handling for supported image files without causing browser navigation

## 2. Image Preview

- [x] 2.1 Add a composer attachment thumbnail action that opens a larger local image preview
- [x] 2.2 Add preview close behavior that preserves the current prompt draft and attachment list
- [x] 2.3 Style drag/drop feedback and the image preview so the composer remains compact and responsive

## 3. Verification

- [x] 3.1 Add frontend regression coverage for pasted image attachment submission
- [x] 3.2 Add frontend regression coverage for dropped image attachments and draft preservation
- [x] 3.3 Add frontend regression coverage for composer image preview open and close behavior
- [x] 3.4 Run OpenSpec validation and relevant Go/frontend tests
