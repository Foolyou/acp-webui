## 1. Timeline Data

- [ ] 1.1 Update timeline block normalization so linked image artifacts render as image blocks and their duplicate display-image tool rows are suppressed.
- [ ] 1.2 Update timeline block tests for linked image artifact ordering and ordinary tool grouping.

## 2. Tool Presentation

- [ ] 2.1 Add readable plain-text tool detail generation for expanded tool rows.
- [ ] 2.2 Simplify Session Detail tool rows to one expand icon and remove output, diagnostics, and artifact buttons from ordinary tool rows.
- [ ] 2.3 Update tool display tests for compact summaries and plain-text detail fallbacks.

## 3. Image Presentation

- [ ] 3.1 Render image artifacts as visual timeline blocks with description text and click-to-enlarge behavior.
- [ ] 3.2 Remove raw JSON details from image artifact overlay rendering.
- [ ] 3.3 Update CSS for compact tool rows, image blocks, and mobile-safe expanded text.

## 4. Verification

- [ ] 4.1 Run frontend tests and build.
- [ ] 4.2 Run backend tests.
- [ ] 4.3 Build and restart the release service bound to the Tailscale address.
