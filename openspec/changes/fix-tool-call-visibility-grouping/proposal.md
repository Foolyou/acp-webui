## Why

Completed ACP tool call updates can be misclassified as permission bookkeeping when the backend cannot derive a tool title. The frontend then folds those rows away before grouping, so users see no collapsed tool-call history even though the timeline contains completed tool activity.

## What Changes

- Preserve generic completed tool calls as visible timeline entries even when their title or payload is incomplete.
- Restrict permission-bookkeeping folding to explicit permission or approval tool activity instead of relying on a generic title match.
- Keep consecutive completed tool calls collapsed by default with an accurate count and expandable ordered details.
- Improve fallback display labels for raw ACP tool updates so grouped details are still useful when structured fields are sparse.
- Add regression coverage for unknown completed tool calls titled like permission requests, explicit permission bookkeeping rows, and backend fallback titles.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-timeline-data-model`: Tool call fallback data and grouping semantics must preserve generic completed tool calls instead of presenting them as permission bookkeeping.
- `react-frontend-application`: The React timeline must render grouped completed tool calls even when ACP payloads have sparse display data, while continuing to hide explicit permission bookkeeping rows.

## Impact

- Backend ACP tool call title and permission request fallback logic.
- Frontend timeline block grouping and permission-bookkeeping folding logic.
- Frontend tool display fallback extraction for sparse or nested ACP payloads.
- Unit tests for backend ACP parsing and frontend timeline grouping/display behavior.
