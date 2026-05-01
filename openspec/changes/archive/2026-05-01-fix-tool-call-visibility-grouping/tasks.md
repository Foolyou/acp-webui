## 1. Backend Tool Call Fallbacks

- [x] 1.1 Change generic ACP tool call title fallback to a neutral label that does not imply permission activity.
- [x] 1.2 Keep permission request display fallback permission-specific for approval UI.
- [x] 1.3 Add backend regression coverage for generic tool calls without title/name data and permission request fallback behavior.

## 2. Frontend Grouping And Display

- [x] 2.1 Restrict permission-bookkeeping folding to explicit permission or approval tool kinds.
- [x] 2.2 Preserve sparse or legacy generic completed tool calls in collapsed completed-tool-call groups.
- [x] 2.3 Improve tool display fallback extraction from sparse or nested ACP payloads.
- [x] 2.4 Add frontend regression coverage for sparse completed tool grouping and explicit permission bookkeeping folding.

## 3. Validation

- [x] 3.1 Run OpenSpec validation for the change.
- [x] 3.2 Run backend and frontend tests that cover the changed behavior.
- [x] 3.3 Run the frontend production build.
