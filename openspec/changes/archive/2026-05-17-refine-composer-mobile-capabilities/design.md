## Context

Session Detail already supports text prompts, queued prompts, image attachments, voice input, prompt templates, stop controls, disabled states, approval blocking, browser fullscreen, and browser notifications. The current problem is presentation: composer controls can become text-heavy and tall, especially on mobile, while utility controls such as fullscreen and notification enablement are not consistently reachable from mobile workbench chrome.

This change is a frontend refinement. Existing prompt submission, queueing, attachment, transcription, template, stop, fullscreen, and notification contracts remain intact.

## Goals / Non-Goals

**Goals:**

- Make the persistent composer visually leaner by moving common actions to icon controls with accessible labels and hover or focus tooltips.
- Preserve text where it communicates user risk, state, errors, or confirmation choices better than an icon.
- Keep mobile composer height stable and avoid overlap with the timeline, approval surfaces, and workbench chrome.
- Expose fullscreen and notification enablement from mobile workbench chrome when browser support allows.
- Add regression coverage for compact composer controls and mobile utility controls.

**Non-Goals:**

- No backend API changes for prompts, notifications, fullscreen, sessions, or workspaces.
- No replacement of existing composer features such as image attachments, voice input, prompt templates, skill autocomplete, stop, or queued prompts.
- No requirement to force notifications or fullscreen when browser support or permission state prevents them.

## Decisions

1. Use icon-first composer actions with accessible names.

   The composer should render common actions such as send, stop, attach image, voice input, templates, and attachment removal as icon buttons where an icon is familiar and available. Each icon control needs an accessible name and tooltip so the UI can be compact without becoming ambiguous.

   Alternative considered: shorten text labels but keep text buttons. This still consumes width and height on mobile, and it does not solve the accumulated chrome around the input.

2. Keep stateful and risky copy as text.

   Disabled reasons, validation errors, approval-blocking states, destructive stop scope choices, and notification permission explanations should remain textual where needed. The goal is less persistent button copy, not hiding important state.

   Alternative considered: make every control icon-only. That would reduce space but weaken supervision clarity when a session is blocked, risky, or requires user confirmation.

3. Treat mobile utility actions as workbench chrome, not composer actions.

   Fullscreen and notification enablement should be reachable from mobile top or overflow chrome so they do not compete with prompt drafting controls. This also keeps the composer focused on prompt input and turn control.

   Alternative considered: place fullscreen and notifications in the sticky composer. That would make them reachable, but it would increase composer height and mix global app controls with prompt actions.

4. Use existing frontend dependencies and icon system.

   The implementation should use the project's current React components, styling approach, and existing icon library rather than introducing a new UI dependency for this refinement.

   Alternative considered: add a dedicated toolbar package. The interaction scope is small enough that a new dependency would add unnecessary surface area.

## Risks / Trade-offs

- Icon controls become less discoverable -> Provide accessible names, tooltips, consistent placement, and preserve text for ambiguous state or confirmation controls.
- Mobile utility controls crowd the top bar -> Use a compact chrome layout or overflow grouping that keeps navigation, status, fullscreen, and notification actions reachable without overlap.
- Browser support varies for fullscreen and notifications on mobile -> Show enabled controls only when the corresponding API and permission state allow a usable action, and keep normal realtime behavior available otherwise.
- Layout regressions appear only on narrow screens -> Add mobile browser automation coverage for composer height, overlap, fullscreen reachability, and notification reachability.
