# Mobile Remote Agent Controller Decisions

Date: 2026-05-16
Status: product direction decisions

## Product Direction

ACP Web UI is moving toward a mobile-friendly remote agent controller.

The primary mental model is not an IDE, an agent catalog, or a generic admin dashboard. The user is controlling remote/local agent work from a mobile browser. The product should help the user choose a project, supervise agent sessions, approve risky actions, cancel or continue work, and review results.

## Primary Information Architecture

Workspace is the primary entry point.

A workspace represents the project, filesystem boundary, safety context, and session organization unit. Agents are not primary destinations. Agents are execution choices and filters within a workspace, and their configuration belongs in Settings.

The main product path is:

```text
Workspace list
  -> Workspace cockpit
    -> Session Detail
```

Supporting areas:

- Inbox: cross-workspace pending approval inbox.
- Settings: controller configuration, access status, agent configuration, storage, and diagnostics.

## Workspace List

The first screen should look like a project list rather than a dashboard.

Each workspace card may show lightweight state summary, such as pending approval count, running count, failed count, and recent activity. The primary action is entering the workspace. Workspace creation, editing, and deletion remain available as management actions, but they should not dominate the project-list experience.

## Workspace Cockpit

After entering a workspace, the user sees a workspace-scoped control surface.

The workspace cockpit includes:

- A pending approval count.
- A quick filter for sessions waiting on permission approval.
- A default session list containing all agents' sessions in that workspace.
- Session cards sorted by latest activity by default.
- Agent type shown on each session card.
- Status and agent filters.
- A New Session action.

## Workspace Attention

Workspace attention is approval-focused in the first version.

The workspace cockpit shows a pending approval session count and provides a quick filter for sessions waiting on permission decisions. Failed, restore-needed, queued, or long-running sessions may have status badges, but they do not count as workspace attention unless the product intentionally broadens that concept later.

## Workspace Session Filters

Workspace session filtering uses two composable single-select filter groups:

- Status filter.
- Agent filter.

Default view:

```text
Status: All
Agent: All agents
Sort: latest activity descending
```

First-version status filters:

- All.
- Pending approval.
- Running.
- Failed.
- View only / restore needed.

First-version agent filters:

- All agents.
- Codex.
- Claude.
- OpenCode.
- Custom agents.

The pending approval attention shortcut applies the pending approval status filter. Agent filtering narrows the same workspace session list without becoming separate primary navigation.

## Session Cards

Session cards in the workspace cockpit are compact control summaries.

Each card must show:

- Owning agent.
- Permission mode.
- Current session status.
- Prompt-derived title or summary.
- Last activity time.

Permission mode is a first-class card attribute because it communicates risk posture, especially for YOLO sessions.

Pending approval is displayed as a strong card state, but approve/reject actions are not available directly on the card. Users must enter Session Detail to make permission decisions with full context.

Session titles are prompt-derived by default rather than required during creation. Manual title editing can exist later as a management action.

Cards may show secondary badges for review evidence, view-only/restore state, and queued prompt count. Debug identifiers and raw runtime details stay out of the default card.

## Session Detail

Session Detail is the core control surface.

It should organize:

- Header: workspace, agent, permission mode, status, and cancel.
- Active state strip: running state, waiting approval state, elapsed time.
- Approval surface.
- Timeline.
- Prompt composer.
- Review viewer entry points.

## Pending Approval Composer Behavior

When a session is waiting for permission approval, the prompt composer remains visible in its normal location but is disabled with a clear waiting-for-approval state.

The page layout stays stable, but prompting is blocked until the user resolves the approval. The approval surface becomes the primary action area during this state.

## Queued Prompts

ACP Web UI keeps queued prompts as a deliberate remote-control feature.

Users may submit follow-up prompts while a session is running. Those prompts are queued and clearly shown as waiting behind the active turn.

Queued prompts do not count as workspace attention.

When a session is waiting for permission approval, the composer is disabled and additional prompts cannot be queued until the approval is resolved.

Session cards may show queued prompt count as secondary status.

## Cancel Behavior With Queued Prompts

Canceling a running turn is distinct from clearing queued follow-up prompts.

If queued prompts exist, the UI must ask whether the user wants to:

- Cancel only the active turn.
- Cancel the active turn and clear the queue.

Clearing queued prompts is explicit and should leave visible session state so the user can understand what happened.

When no queued prompts exist, cancel can remain a direct running-turn action.

## Approval Surface

Pending permission requests are presented through a prominent sticky inline approval panel near the main session controls rather than a modal bottom sheet.

This keeps the decision highly visible while preserving access to timeline context.

When multiple approvals are pending, the UI shows only the active approval and a queued approval count. Additional approvals are surfaced one at a time after the current decision is resolved.

## Review Evidence

Review evidence remains embedded in Session Detail rather than becoming a primary navigation destination.

Timeline entries and tool rows expose concise evidence actions. Selecting evidence opens a unified full-screen, session-scoped review viewer.

The review viewer adapts to evidence type:

- Unified diff.
- Changed files.
- Terminal output.
- Markdown preview and source.
- Images.
- Generic artifacts.

Side-by-side diff is not a first-version mobile priority.

Session cards may show a lightweight review evidence badge, such as "Review available", but detailed evidence inspection belongs in the review viewer.

## New Session Flow

New Session is workspace-scoped.

If the workspace has a remembered last profile, the primary action offers:

- Start last profile.
- Configure manually.

If the workspace has no remembered last profile, it opens manual configuration directly.

Starting the last profile does not create an empty session. It opens the New Session compose screen with the remembered profile preselected, and the user creates the session only after entering an initial prompt.

Manual configuration uses the same screen with configuration controls expanded.

The confirmed profile is saved as the workspace's last profile.

Manual configuration fields include:

- Agent.
- Permission mode.
- Model/config options.
- Initial prompt.
- Optional prompt template.

## Workspace-Scoped Last Profile

The Start last profile shortcut is scoped per workspace.

Each workspace remembers the most recently confirmed session creation profile used inside that workspace. The shortcut is not global, because agent choice, permission mode, and launch controls are project-context decisions.

## Inbox

The global Inbox is approval-focused in the first version.

It aggregates pending permission approvals across all workspaces and provides a direct path into the relevant Session Detail.

Workspace cockpits expose the same concept scoped to a single workspace through pending approval counts and filters.

Failed, restore-needed, long-running, and queued-prompt states do not appear in Inbox unless the product intentionally broadens Inbox later.

## Settings

Settings is the configuration area for the remote agent controller.

Agent status and configuration belong inside Settings rather than primary navigation. The main product path remains workspace selection, workspace-scoped session control, and Session Detail.

Settings should include:

- Access.
- Agents.
- Storage.
- Diagnostics.

## Access Settings

Access settings are observational in the first version.

The browser UI shows:

- Current bind host.
- Port.
- Access URL.
- Auth status.
- Detected exposure mode.
- Tailscale Serve URL when available.

The browser UI does not change bind mode or execute Tailscale commands.

Network exposure remains controlled by startup scripts and CLI flags. This keeps the browser UI out of local daemon and tailnet configuration.

## Agent Configuration

Agent configuration lives in Settings.

Built-in agents such as Codex, Claude, and OpenCode may be edited for command and arguments, with a reset-to-default action.

Custom ACP agents are supported in a minimal first version with:

- Display name.
- Command.
- Arguments.
- Enabled state.

Agent capability information should come from runtime discovery whenever possible. Manual capability configuration is not a first-version focus except as a fallback.

Runtime status is visible in Settings, but agents are selected and used through workspace-scoped session creation.

## Reconnect Reliability

Reconnect reliability is a product requirement, but durable event replay is not a blocker for the workspace-first navigation redesign.

The first reliability target is robust projection recovery. After reload, reconnect, mobile backgrounding, or network switching, the browser reloads current session, inbox, approval, queue, and review projections and resumes live updates.

Durable normalized event logging with cursor-based replay remains a later reliability upgrade.

## Deferred: Raw ACP Diagnostics And Retention

Raw ACP diagnostics and retention policy are intentionally deferred.

The product should leave room for raw protocol logging, debug export, and storage cleanup, but this decision set does not define default raw-message persistence or retention limits.

These topics require a separate decision pass because they affect privacy, storage growth, diagnostics quality, and adapter debugging workflows.

## Open Exploration: Context Remaining Display

The product should explore ways to show remaining context or context pressure for supported agents.

Questions to investigate:

- Whether ACP or each adapter exposes reliable context usage.
- Whether context remaining should appear on Session Detail, session cards, or only expanded diagnostics.
- Whether the UI should show a precise number, a percentage, or coarse states such as healthy / getting full / near limit.
- How context pressure should affect prompts, queued prompts, restore, or review behavior.

This is an exploration item, not a committed first-version requirement.

## Open Exploration: Markdown Rendering Reliability

The product should explore fixes for confusing Markdown rendering in Session Detail.

Observed issue:

- Markdown content can appear visually confusing on mobile, including raw Markdown markers, awkward line wrapping, and mixed CJK/Latin/code styling.

Questions to investigate:

- Whether message content is being treated as code/preformatted text when it should be rendered as Markdown.
- Whether streaming incomplete Markdown needs different rendering from completed Markdown.
- Whether CJK text, inline code, bold markers, and list indentation need mobile-specific typography rules.
- Whether users need an explicit rendered/source toggle for assistant messages or only for review artifacts.
- How to keep raw source accessible without making the default conversation look like a raw log.

This should be treated as a Session Detail readability and renderer reliability exploration.
