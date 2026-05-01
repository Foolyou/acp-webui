## 1. Backend Display Image Affordance

- [ ] 1.1 Add a workspace-safe image validation and snapshot helper covering path resolution, MIME checks, file size bounds, and neutral display metadata.
- [ ] 1.2 Handle agent display-image requests from a model-visible tool or ACP extension path and persist accepted images as `image` review artifacts.
- [ ] 1.3 Advertise display-image support to compatible agents and add hidden agent guidance that recommends using `display_image` instead of only returning image paths.
- [ ] 1.4 Add conservative assistant/tool text-path enrichment that creates image evidence only for validated workspace-local image files.

## 2. Session Evidence and API

- [ ] 2.1 Extend review artifact kind handling and summary/detail payload expectations for image evidence.
- [ ] 2.2 Emit realtime artifact/timeline updates when image evidence is created.
- [ ] 2.3 Add backend tests for valid display image requests, rejected unsafe paths, unsupported files, prompt guidance, and text-path fallback.

## 3. Frontend Rendering

- [ ] 3.1 Render image artifact summaries inline in Session Detail with bounded desktop and mobile previews.
- [ ] 3.2 Add image-specific review artifact drill-down rendering with preview-first layout and raw diagnostics fallback.
- [ ] 3.3 Keep linked image artifacts reachable from tool evidence actions without duplicating heavy standalone cards.
- [ ] 3.4 Add frontend tests for timeline image rendering, drill-down rendering, linked evidence behavior, and mobile layout safety.

## 4. Verification

- [ ] 4.1 Run OpenSpec validation for the change.
- [ ] 4.2 Run backend and frontend test suites relevant to session prompting, artifacts, and timeline rendering.
- [ ] 4.3 Manually exercise a session that produces or references an image and confirm the image appears without refreshing.
