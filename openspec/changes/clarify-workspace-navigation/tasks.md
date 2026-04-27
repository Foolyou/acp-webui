## 1. Navigation Information Architecture

- [x] 1.1 Update the shared workbench navigation structure so the primary `Workspaces` route is presented as the full workspace management surface
- [x] 1.2 Replace the sidebar and mobile `Projects` label with workspace-specific shortcut terminology that clearly describes the list as a subset of workspaces
- [x] 1.3 Preserve existing workspace shortcut routing and active-state behavior while clarifying the visual separation between the management route and shortcut links

## 2. Workspace Surface Copy

- [x] 2.1 Update the routed workspace page heading and supporting copy to use canonical workspace terminology instead of project terminology
- [x] 2.2 Verify the Workspaces route still presents full workspace listing and creation controls after the copy changes

## 3. Verification

- [x] 3.1 Update frontend tests or browser assertions that depend on the old `Projects` or `Local projects` labels
- [x] 3.2 Run the relevant frontend build and navigation-focused verification for desktop and mobile workbench navigation
