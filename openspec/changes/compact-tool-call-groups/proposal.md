## Why

Session timelines with many consecutive tool calls currently read like dense execution logs, even after each tool row was made more compact. Users need a Codex-like transcript view that summarizes repeated tool activity while preserving access to individual commands, outputs, artifacts, and diagnostics.

## What Changes

- Group consecutive tool call timeline items into compact activity summaries before rendering Session Detail.
- Render a single tool call as a terse transcript line such as `Ran npm run build`.
- Render multiple consecutive tool calls as a collapsible summary such as `Ran 4 commands`, with expanded access to each underlying item.
- Surface failure counts and mixed activity labels in the collapsed group summary.
- Suppress non-actionable permission history and artifact-only noise from the default timeline when that information is already represented by pending approval UI or tool evidence links.
- Preserve raw diagnostics and review artifact drill-downs behind explicit expanded controls.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-experience-visual-system`: Session Detail tool activity SHALL render as compact Codex-like grouped transcript rows.
- `session-review-artifacts`: Review artifact timeline noise SHALL be reduced when artifacts are reachable as tool evidence.
- `session-timeline-data-model`: Normalized timeline rendering SHALL preserve item order while allowing frontend display grouping without changing backend item shapes.
- `workspace-session-chat`: Session Detail SHALL keep review evidence reachable while no longer requiring every linked artifact to render as a standalone card.

## Impact

- Affected frontend code: Session Detail timeline rendering, tool display helpers, and timeline CSS.
- Affected tests: frontend tool display/unit coverage and targeted session flow rendering checks.
- Backend API and persistence remain unchanged.
