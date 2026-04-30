## 1. Navigation Updates

- [x] 1.1 Remove the standalone Sessions link from the primary desktop sidebar navigation.
- [x] 1.2 Remove the standalone Sessions link from the mobile full-screen navigation while preserving workspace shortcut links.
- [x] 1.3 Ensure selecting a workspace shortcut continues to navigate to `/workspaces/$workspaceId/sessions` and updates active workspace state.

## 2. Session Detail Return

- [x] 2.1 Add a compact return control in Session Detail that links to the current workspace's session list route.
- [x] 2.2 Keep the return control available on desktop and mobile without crowding session status, model, permission mode, and Diff controls.
- [x] 2.3 Preserve existing session detail deep-link loading and current workspace persistence.

## 3. Verification

- [x] 3.1 Update browser tests to assert that the primary navigation no longer shows a standalone Sessions entry.
- [x] 3.2 Add or update browser coverage for returning from Session Detail to the current workspace session list.
- [x] 3.3 Run frontend build, unit tests, lint, and relevant Playwright coverage.
