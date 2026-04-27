## Why

The current sidebar uses `Workspaces` and `Projects` to point at the same underlying workspace records. That overlap makes it unclear whether these labels represent different concepts, different scopes, or just duplicate entry points, which adds friction to basic navigation.

## What Changes

- Clarify the sidebar information architecture so each navigation surface has a distinct purpose.
- Treat the routed `Workspaces` page as the full workspace management surface for viewing and creating local workspaces.
- Rename or reposition the sidebar workspace shortcut list so it is clearly presented as a subset of workspaces rather than a second product concept.
- Align desktop navigation, mobile navigation, and routed page headings around consistent workspace terminology.
- Update navigation and UI verification coverage to reflect the clarified labels and responsibilities.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `session-workbench-navigation`: Clarify the difference between workspace management navigation and workspace shortcut navigation, and require consistent workspace terminology across workbench surfaces.

## Impact

- Affects frontend navigation copy, sidebar structure, routed page headings, and mobile navigation presentation.
- Affects frontend tests that assert navigation labels, headings, and route reachability.
- Does not change backend APIs, persistence, workspace/session identifiers, or ACP behavior.
