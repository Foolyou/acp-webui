## 1. Notification Service

- [x] 1.1 Add a frontend notification helper for support detection, permission requests, current permission state, and safe notification delivery.
- [x] 1.2 Add tests for supported, unsupported, granted, denied, and default browser notification states.

## 2. Workbench UI

- [x] 2.1 Add a compact notification enablement control to the workbench chrome.
- [x] 2.2 Render disabled or unavailable states without disrupting desktop or mobile navigation.

## 3. Realtime Triggers

- [x] 3.1 Trigger a permission-request notification from `permission_requested` realtime events.
- [x] 3.2 Trigger a turn-completion notification only when a running or stopping active turn transitions to idle/no active turn.
- [x] 3.3 Prevent duplicate completion notifications for repeated reconcile events.

## 4. Verification

- [x] 4.1 Add frontend tests for notification trigger behavior.
- [x] 4.2 Run focused frontend tests and build verification.
