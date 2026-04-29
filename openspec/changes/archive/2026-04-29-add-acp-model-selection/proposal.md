## Why

ACP agents can advertise session-level configuration such as model, mode, and reasoning controls through the stabilized `configOptions` protocol surface, but ACP Web UI currently discards that data and offers no way to switch models after a session is created.

Adding model selection now lets users choose among the models exposed by each agent without creating separate agent entries, while keeping the implementation aligned with the stable ACP contract.

## What Changes

- Capture ACP `configOptions` returned by `session/new` and session restoration responses.
- Persist the latest complete session configuration option state for each local session.
- Expose session configuration options through session detail and session list APIs, including compact current-model metadata when an agent advertises a model selector.
- Add a backend API to set a session configuration option through ACP `session/set_config_option`.
- Handle ACP `config_option_update` notifications so agent-initiated configuration changes are reflected in storage and the browser.
- Add a session model selector in the browser when the owning agent advertises a model configuration option.
- Restrict model/configuration changes to live idle sessions in the first version to avoid racing active prompt turns or approval waits.

## Capabilities

### New Capabilities

- `session-config-options`: Session-level ACP configuration exposure and selection, including model discovery, model switching, persistence, API projection, realtime updates, and browser controls.

### Modified Capabilities

- None.

## Impact

- Backend ACP runtime needs to preserve `session/new`, `session/load`, and `session/set_config_option` configuration state rather than only the ACP session id.
- Storage needs a migration for persisted session configuration snapshots and compact current-model projection fields.
- API models and routes need new fields and a configuration update endpoint.
- WebSocket events need to carry session configuration changes to connected browsers.
- React frontend types, session detail UI, and session list presentation need to render and update model state.
- Fake ACP fixtures and Rust, frontend, and Playwright tests need coverage for advertised models, successful switching, invalid switching, and agent-driven updates.
