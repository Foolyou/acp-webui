## 1. Display Projection

- [ ] 1.1 Add a pure timeline block projection that groups consecutive tool calls while preserving raw item order.
- [ ] 1.2 Fold linked review artifacts into grouped tool evidence and keep orphan artifacts as fallback timeline blocks.
- [ ] 1.3 Treat historical permission items as secondary timeline metadata while preserving standalone fallback rendering when needed.

## 2. Timeline Rendering

- [ ] 2.1 Render single tool-call blocks as terse Codex-like transcript rows.
- [ ] 2.2 Render multi-tool blocks as expandable summaries with aggregate labels and failure counts.
- [ ] 2.3 Render expanded group items with concise subject, status, output, evidence, and diagnostics controls.

## 3. Visual Design

- [ ] 3.1 Update CSS so grouped tool activity reads as low-weight transcript activity instead of repeated cards.
- [ ] 3.2 Ensure long commands, mixed labels, evidence buttons, and diagnostics fit on mobile without horizontal overflow.

## 4. Verification

- [ ] 4.1 Add unit tests for grouping boundaries, single-call labels, multi-call labels, failures, artifact folding, and permission fallback behavior.
- [ ] 4.2 Update targeted browser coverage for compact grouped tool activity in Session Detail.
- [ ] 4.3 Run frontend unit tests, lint, and build.
