## Context

The current create controls live in the session list and call `createSession` immediately with selected agent and launch controls. The app stores a single global last profile in local storage. The decision document requires per-workspace profile memory and a compose screen that does not create an empty session before the initial prompt exists.

## Goals / Non-Goals

**Goals:**

- Make the New Session action workspace-scoped.
- Preselect the workspace's last confirmed profile when available.
- Require an initial prompt before creating the session.
- Preserve manual configuration controls for agent, permission, and launch options.

**Non-Goals:**

- Do not add backend persistence for last profile in this change.
- Do not implement a full template management redesign.
- Do not remove existing session config option support after a session starts.

## Decisions

1. Store last profiles in local storage keyed by workspace id.
   - Rationale: The shortcut is a browser UX convenience and existing last profile storage is already local.
   - Alternative considered: add a database table. Deferred until profiles need cross-browser sync.

2. Add an optional initial prompt to session creation.
   - Rationale: A single create-and-start request avoids exposing an empty session from the shortcut flow.
   - Alternative considered: create the session then immediately call prompt from the frontend. Rejected because the user-visible session can exist empty if the prompt call fails.

3. Keep manual configuration and last-profile start on the same compose screen.
   - Rationale: The screen can expand configuration controls while keeping the initial prompt as the required confirmation step.
   - Alternative considered: separate wizard steps. Rejected as too heavy for the mobile first version.

## Risks / Trade-offs

- Local storage profile migration can ignore old global values. -> Support reading the old global profile as a fallback only when no workspace profile exists.
- Create-and-start can fail after session creation if the prompt fails. -> Return current detail and show failure through existing session error/status handling.
- More creation UI can add density. -> Default to collapsed configuration when starting last profile and expanded controls for manual configuration.
