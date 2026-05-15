## 1. Timeline Data

- [x] 1.1 Update timeline block normalization so linked image artifacts render as image blocks and their duplicate display-image tool rows are suppressed.
- [x] 1.2 Update timeline block tests for linked image artifact ordering and ordinary tool grouping.

## 2. Tool Presentation

- [x] 2.1 Add readable plain-text tool detail generation for expanded tool rows.
- [x] 2.2 Simplify Session Detail tool rows to one expand icon and remove output, diagnostics, and artifact buttons from ordinary tool rows.
- [x] 2.3 Update tool display tests for compact summaries and plain-text detail fallbacks.

## 3. Image Presentation

- [x] 3.1 Render image artifacts as visual timeline blocks with description text and click-to-enlarge behavior.
- [x] 3.2 Remove raw JSON details from image artifact overlay rendering.
- [x] 3.3 Update CSS for compact tool rows, image blocks, and mobile-safe expanded text.

## 4. Verification

- [x] 4.1 Run frontend tests and build.
- [x] 4.2 Run backend tests.
- [x] 4.3 Build and restart the release service bound to the Tailscale address.
