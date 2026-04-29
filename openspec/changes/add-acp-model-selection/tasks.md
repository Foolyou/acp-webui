## 1. Data Model

- [ ] 1.1 Add a SQLite migration for session configuration option snapshots and compact current-model projection fields.
- [ ] 1.2 Add Rust model types for ACP session config options, select values, optional grouped values, and current model projection.
- [ ] 1.3 Update storage session queries and row mapping to read and write configuration snapshots and current model projection fields.
- [ ] 1.4 Add helper logic that derives current model metadata from the first `category: "model"` select option, falling back to `id: "model"`.

## 2. ACP Runtime

- [ ] 2.1 Change session creation to return both ACP session id and returned `configOptions`.
- [ ] 2.2 Persist returned configuration options when creating a local session.
- [ ] 2.3 Persist returned configuration options when `session/load` restoration succeeds and returns configuration state.
- [ ] 2.4 Add a runtime method that calls ACP `session/set_config_option` for a mapped live session and returns the complete updated configuration state.
- [ ] 2.5 Handle ACP `config_option_update` session notifications by mapping ACP session id to local session id and updating persisted configuration state.

## 3. Backend API And Realtime

- [ ] 3.1 Add session detail and session list response fields for full configuration options and compact current-model metadata.
- [ ] 3.2 Add a `POST /api/sessions/:session_id/config-options/:config_id` route that accepts a selected value.
- [ ] 3.3 Reject configuration changes for empty values, unknown sessions, non-continuable sessions, running sessions, waiting-approval sessions, and unavailable owning runtimes.
- [ ] 3.4 Emit a session-scoped realtime configuration update after successful user-initiated changes and agent-initiated updates.
- [ ] 3.5 Update realtime session-list reducers or projections so model summaries change without disturbing status, approval, review, or continuity state.

## 4. Frontend

- [ ] 4.1 Add TypeScript types for session configuration options, model projection, and configuration update realtime events.
- [ ] 4.2 Add an API client method for setting a session configuration option.
- [ ] 4.3 Render a model selector in Session Detail when a model configuration option is advertised.
- [ ] 4.4 Disable model switching when the session is running, waiting for approval, not continuable, or the owning runtime is unavailable.
- [ ] 4.5 Update current session and session list state when configuration API responses or realtime updates arrive.
- [ ] 4.6 Show compact current-model summaries in session list rows only when model metadata is available.

## 5. Tests And Verification

- [ ] 5.1 Extend the fake ACP fixture to advertise model `configOptions`, accept valid `session/set_config_option` requests, reject invalid values, and emit `config_option_update`.
- [ ] 5.2 Add Rust tests for model projection, session creation persistence, restore persistence, configuration route validation, successful switching, rejected switching, and agent-driven updates.
- [ ] 5.3 Add frontend unit tests for model option extraction, disabled states, and realtime state updates.
- [ ] 5.4 Add Playwright coverage for advertised model display, successful model switch, reload/list persistence, and disabled switching during running or approval states.
- [ ] 5.5 Run backend tests, frontend tests, and browser E2E coverage relevant to session creation and model switching.
