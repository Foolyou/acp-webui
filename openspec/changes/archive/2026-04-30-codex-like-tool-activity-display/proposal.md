## Why

Session Detail currently renders each tool call as an individual expandable card that still feels close to a raw event log. This makes busy sessions hard to scan on mobile, where users need to quickly understand what the agent did, whether it succeeded, and where to inspect supporting evidence.

Codex-style agent interfaces treat tool activity as typed work items with concise progress rows, clear result states, and drill-down evidence. ACP Web UI should move toward that model while preserving raw diagnostics for troubleshooting.

## What Changes

- Replace the current generic tool-call row strategy with compact Codex-like tool activity rows that emphasize action, subject, status, and outcome.
- Classify recognizable tool activity into user-facing display kinds such as command execution, file change, file read, search, browser activity, MCP call, and generic tool call.
- Keep raw input and output available through diagnostics, but hide raw JSON by default.
- Promote review evidence links from generic "Open artifact" actions into typed evidence affordances such as output, diff, Markdown, terminal output, or diagnostics.
- Ensure mobile rows remain readable for long commands, paths, URLs, and output snippets without causing horizontal overflow or card-heavy timeline clutter.
- Add browser and unit coverage for mobile-friendly tool activity rows, failed command states, evidence links, and diagnostics access.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-experience-visual-system`: refine tool activity presentation from generic expandable cards into compact Codex-like rows with mobile-friendly evidence and diagnostics behavior.
- `session-timeline-data-model`: expose enough normalized tool activity display data for stable concise rendering without requiring the browser to infer everything from raw payloads.
- `session-review-artifacts`: clarify how tool activity rows link to terminal output, diffs, Markdown, and other review evidence without turning the timeline into a raw log.

## Impact

- Frontend session timeline rendering, especially `ToolCallRow` and `toolCallDisplay`.
- Frontend CSS for mobile and desktop tool activity density, wrapping, and evidence actions.
- Frontend unit and Playwright coverage for tool activity rendering.
- Backend session timeline projection may gain optional display/evidence fields while preserving existing raw payloads and current clients.
- No new external runtime dependency is expected.
