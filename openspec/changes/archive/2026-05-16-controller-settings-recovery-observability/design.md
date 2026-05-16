## Context

The app currently exposes agent status through a top-level Agents route and returns auth status separately from app state. Reconnect handling reopens the websocket and reconciles the current session, but does not reliably reload all projections such as inbox and workspace-scoped session lists.

## Goals / Non-Goals

**Goals:**

- Move agent status under Settings.
- Add read-only Access, Agents, Storage, and Diagnostics sections.
- Show access information without exposing sensitive local machine details in committed examples or tests.
- Reload all relevant projections after reconnect, visibility, and online events.

**Non-Goals:**

- Do not execute `tailscale` commands from the browser UI.
- Do not change bind mode from Settings.
- Do not implement custom agent editing in this first settings observability change.
- Do not implement durable normalized event replay.

## Decisions

1. Add access info to app state rather than polling a separate endpoint first.
   - Rationale: Settings renders from the same controller projection as agent and diagnostics state.
   - Alternative considered: a dedicated `/api/access` endpoint. Deferred until access info needs independent refresh or permissions.

2. Detect exposure mode conservatively from configured bind host and request context.
   - Rationale: The UI is observational and should avoid claiming more than it knows.
   - Alternative considered: shelling out to Tailscale from the server. Rejected for the first version because startup scripts own Tailscale configuration.

3. Centralize projection recovery in the app state owner.
   - Rationale: `App.tsx` owns workspaces, sessions, inbox, and current session, so it can reconcile them coherently after reconnect.
   - Alternative considered: rely on realtime events only. Rejected because missed events can occur during mobile backgrounding or network switches.

## Risks / Trade-offs

- Tailscale Serve URL may be unavailable. -> Show an unavailable/unknown state rather than guessing.
- Reloading projections after reconnect adds API requests. -> Scope session list reloads to the current workspace and agent filter state.
- Settings may later need editing. -> Keep component boundaries sectioned so edit forms can be added without moving navigation again.
