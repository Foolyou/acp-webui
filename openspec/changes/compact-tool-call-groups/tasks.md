## 1. Display Projection

- [x] 1.1 Add a pure timeline block projection that groups consecutive tool calls while preserving raw item order.
- [x] 1.2 Fold linked review artifacts into grouped tool evidence and keep orphan artifacts as fallback timeline blocks.
- [x] 1.3 Treat historical permission items as secondary timeline metadata while preserving standalone fallback rendering when needed.

## 2. Timeline Rendering

- [x] 2.1 Render single tool-call blocks as terse Codex-like transcript rows.
- [x] 2.2 Render multi-tool blocks as expandable summaries with aggregate labels and failure counts.
- [x] 2.3 Render expanded group items with concise subject, status, output, evidence, and diagnostics controls.

## 3. Visual Design

- [x] 3.1 Update CSS so grouped tool activity reads as low-weight transcript activity instead of repeated cards.
- [x] 3.2 Ensure long commands, mixed labels, evidence buttons, and diagnostics fit on mobile without horizontal overflow.

## 4. Verification

- [x] 4.1 Add unit tests for grouping boundaries, single-call labels, multi-call labels, failures, artifact folding, and permission fallback behavior.
- [x] 4.2 Update targeted browser coverage for compact grouped tool activity in Session Detail.
- [x] 4.3 Run frontend unit tests, lint, and build.
