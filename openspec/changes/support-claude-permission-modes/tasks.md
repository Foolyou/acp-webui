## 1. Backend Provider Mapping

- [x] 1.1 Add Claude-specific permission modes and launch profiles for `manual` and `yolo`
- [x] 1.2 Centralize local-to-Claude ACP mode mapping with validation helpers
- [x] 1.3 Apply the mapped Claude ACP `mode` after `session/new` and before initial prompt submission
- [x] 1.4 Preserve refreshed Claude config options and fail cleanly when the requested mode is unavailable

## 2. User Interface

- [x] 2.1 Verify Claude `yolo` is selectable in new session creation and unsupported modes remain hidden
- [x] 2.2 Ensure Claude YOLO sessions show the persistent detail and list warnings from local `permissionMode`
- [x] 2.3 Keep ACP `mode` session controls visible without rewriting local permission mode after creation

## 3. Tests And Validation

- [x] 3.1 Add backend tests for Claude catalog modes, creation-time mode setting, and unavailable bypass handling
- [x] 3.2 Add frontend tests for Claude YOLO creation options and risk indicators
- [x] 3.3 Run OpenSpec validation plus focused Go and frontend test suites
