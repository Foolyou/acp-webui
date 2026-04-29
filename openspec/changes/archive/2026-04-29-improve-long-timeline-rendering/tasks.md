## 1. Timeline Layout

- [x] 1.1 Replace the Session Detail `.timeline` grid layout with a block or column flex layout that preserves existing spacing, width constraints, and timeline item order.
- [x] 1.2 Verify the sticky composer, timeline end sentinel, notices, messages, tool rows, approval rows, and review artifact cards still render and scroll correctly after the layout change.

## 2. Performance Regression Coverage

- [x] 2.1 Add a focused Playwright long-timeline fixture or mocked session detail that renders a large visible timeline without requiring many backend prompt turns.
- [x] 2.2 Add a Playwright test that types into the enabled prompt composer with the long timeline visible and asserts typing latency stays below a conservative regression threshold.
- [x] 2.3 Ensure the performance test verifies the composer remains usable and does not hide or remove the timeline content under test.

## 3. Verification

- [x] 3.1 Run the relevant frontend build or type-check command.
- [x] 3.2 Run the relevant Playwright session flow tests, including existing auto-scroll coverage and the new long-timeline responsiveness test.
- [x] 3.3 Update this task list as tasks are completed during implementation.
