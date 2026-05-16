# workspace-session-chat Specification

## Purpose
TBD - created by archiving change add-initial-codex-session-flow. Update Purpose after archive.
## Requirements
### Requirement: User can create a local workspace

The system SHALL allow the user to create a workspace from a local filesystem path.

#### Scenario: Workspace is created from a valid path

- **WHEN** the user submits a valid local filesystem path as a workspace
- **THEN** the backend SHALL persist the workspace with an id, display name, path, and creation timestamp
- **AND** the browser SHALL be able to show the workspace in the workspace list

#### Scenario: Workspace path is invalid

- **WHEN** the user submits a path that does not exist or cannot be accessed by the backend
- **THEN** the backend SHALL reject workspace creation
- **AND** the browser SHALL show a readable validation error

### Requirement: User can create a session in a workspace

The system SHALL allow the user to create an agent-backed session for a workspace with visible creation feedback and a persisted permission mode.

#### Scenario: Session is created for an existing workspace

- **WHEN** the user creates a session for an existing workspace and selects an available agent and supported permission mode
- **THEN** the backend SHALL start that agent runtime for the selected permission mode if it is idle or retryable failed
- **AND** it SHALL create the ACP session through that runtime after initialization succeeds
- **AND** it SHALL persist a local session record linked to the workspace with the selected agent id and permission mode
- **AND** the browser SHALL show an optimistic chat loading state until the new session detail is available
- **AND** the browser SHALL navigate to or display the new session detail view

#### Scenario: Session creation is requested while selected agent is starting or disabled

- **WHEN** the user tries to create a session while the selected agent connection is already starting or the selected agent is disabled
- **THEN** the backend SHALL reject the request
- **AND** the browser SHALL show the current connection status for that selected agent

#### Scenario: Session creation requests unsupported permission mode

- **WHEN** the user tries to create a session with a permission mode unsupported by the selected agent
- **THEN** the backend SHALL reject the request
- **AND** the browser SHALL show a readable mode-specific validation error

#### Scenario: Session creation takes noticeable time

- **WHEN** session creation has not completed immediately after the user starts it
- **THEN** the browser SHALL continue showing a loading chat shell or skeleton
- **AND** it SHALL avoid presenting the app as idle or merely disabling the create button

#### Scenario: Session creation omits agent id

- **WHEN** a compatible client creates a session without sending an agent id
- **THEN** the backend SHALL use the configured default agent
- **AND** it SHALL persist that resolved agent id on the session

#### Scenario: Session creation omits permission mode

- **WHEN** a compatible client creates a session without sending a permission mode
- **THEN** the backend SHALL use `manual`
- **AND** it SHALL persist `manual` on the session

### Requirement: User can submit a text prompt
The system SHALL allow the user to submit a text prompt to an idle continuable session or enqueue it for the same session when the current turn is busy.

#### Scenario: Prompt is submitted to an idle session
- **WHEN** the user submits a non-empty text prompt to an idle continuable session
- **THEN** the backend SHALL persist the user prompt as a session message or timeline item
- **AND** it SHALL send the prompt to Codex through ACP
- **AND** the browser SHALL show the submitted prompt in the session timeline

#### Scenario: Empty prompt is submitted
- **WHEN** the user submits an empty or whitespace-only prompt
- **THEN** the browser or backend SHALL reject the prompt
- **AND** no ACP prompt request SHALL be sent
- **AND** no queued prompt SHALL be created

#### Scenario: Prompt is submitted while the session is running
- **WHEN** the user submits a non-empty prompt while a session turn is running
- **THEN** the backend SHALL persist the prompt in that session's ordered prompt queue
- **AND** it SHALL NOT send the queued prompt to ACP until the current turn finishes and the session is eligible for another prompt
- **AND** the browser SHALL show the queued prompt and its queued state

#### Scenario: Prompt is submitted while the session is waiting for approval
- **WHEN** the user submits a non-empty prompt while a session turn has one or more pending approvals
- **THEN** the backend SHALL persist the prompt in that session's ordered prompt queue
- **AND** it SHALL NOT send the queued prompt to ACP until all blocking approvals are resolved and the current turn finishes
- **AND** the browser SHALL indicate that queued work is waiting behind approval resolution

#### Scenario: Queued prompt dispatches after active work completes
- **WHEN** a session with queued prompts becomes idle, continuable, and has no pending approvals
- **THEN** the backend SHALL dispatch the oldest queued prompt to ACP
- **AND** it SHALL update the queued prompt from queued to submitted in the session timeline or queue projection
- **AND** remaining queued prompts SHALL keep their relative order

#### Scenario: Prompt is submitted from keyboard shortcut
- **WHEN** the user presses Ctrl+Enter or Cmd+Enter in the composer while a prompt can be sent or queued
- **THEN** the browser SHALL submit or queue the prompt according to the current session state
- **AND** plain Enter SHALL remain available for multiline text entry

### Requirement: Session detail includes pending approval state
The system SHALL include pending permission request state when returning session detail.

#### Scenario: Session detail is loaded while waiting for approval
- **WHEN** the browser loads session detail for a session with one or more pending permission requests
- **THEN** the backend SHALL include the active pending permission request in the session detail response
- **AND** it SHALL include queue metadata that identifies whether additional approvals are pending
- **AND** the browser SHALL render the session status as `waiting_approval`

#### Scenario: Session detail is loaded with queued approvals
- **WHEN** the browser loads session detail for a session with multiple pending permission requests
- **THEN** the backend SHALL return the pending approval queue in deterministic creation order or enough metadata for the browser to show the active request and queued count
- **AND** the browser SHALL render the active approval and keep the composer disabled

#### Scenario: Session detail is loaded after approval expired
- **WHEN** the browser loads session detail for a session whose pending approvals expired after backend restart
- **THEN** the backend SHALL return the session with failed status
- **AND** the browser SHALL show a readable failure message

### Requirement: Browser displays Codex text responses

The system SHALL display text responses from the session's selected ACP agent in the session timeline.

#### Scenario: Text response is received

- **WHEN** the selected agent sends text response content for a session
- **THEN** the backend SHALL forward the text content to connected browsers for that session
- **AND** the browser SHALL display the text as an assistant message in the timeline

#### Scenario: Text response completes

- **WHEN** the selected agent finishes a text response for a prompt turn
- **THEN** the backend SHALL persist the completed assistant message
- **AND** the browser SHALL show the session as idle or completed for that turn

### Requirement: Session history survives reload

The system SHALL persist session chat history and reload it through the normalized session timeline.

#### Scenario: Browser reloads an existing session

- **WHEN** the browser opens an existing session after page reload or backend restart
- **THEN** the backend SHALL return the persisted workspace, session metadata, continuity metadata, and normalized timeline items
- **AND** the browser SHALL render the restored timeline

#### Scenario: Browser reloads a non-continuable session

- **WHEN** the browser opens an existing session whose ACP runtime context is unavailable
- **THEN** the backend SHALL return the persisted timeline for viewing
- **AND** it SHALL mark the session as not continuable with a readable `viewOnlyReason`

### Requirement: Browser receives live session updates
The system SHALL provide a realtime channel for session text and timeline updates from each session's selected agent and SHALL recover missed persisted state after temporary browser disconnects.

#### Scenario: Browser is connected during a running prompt
- **WHEN** the browser has an open realtime connection for a session and the selected agent emits text content or tool activity
- **THEN** the browser SHALL receive the supported update without polling

#### Scenario: Browser reconnects after disconnect
- **WHEN** the browser reconnects after a temporary disconnect
- **THEN** it SHALL reload the current persisted normalized session timeline before or while resuming live updates
- **AND** it SHALL resume receiving subsequent live updates when the session is continuable and its selected agent runtime is ready

#### Scenario: Mobile browser returns from background
- **WHEN** a mobile browser returns to the app after being backgrounded long enough that the realtime connection may be stale
- **THEN** the browser SHALL verify or recreate the realtime connection
- **AND** it SHALL reload the visible session detail to reconcile messages, tool calls, approvals, queued prompts, and turn state that changed while inactive

### Requirement: Session timeline includes review artifact cards
The system SHALL keep session review evidence reachable inside Session Detail while allowing linked artifacts to appear as evidence actions on related tool activity instead of always rendering as standalone cards.

#### Scenario: Session detail includes standalone review artifact summaries
- **WHEN** the browser loads Session Detail for a session with review artifacts that are not linked to a visible tool activity row
- **THEN** the timeline SHALL render compact review artifact cards among the conversation entries
- **AND** each card SHALL identify the artifact kind, title, summary, and source session context

#### Scenario: Session detail includes linked review artifact summaries
- **WHEN** the browser loads Session Detail for a session with review artifacts linked to visible tool activity
- **THEN** the timeline SHALL make those artifacts reachable from the related tool activity row or expanded tool group
- **AND** it SHALL avoid duplicating the same linked artifact as a standalone default card

#### Scenario: Review artifact card or evidence action is opened
- **WHEN** the user selects a review artifact card or a linked evidence action in the timeline
- **THEN** the browser SHALL open a full-screen drill-down scoped to the current session
- **AND** returning from the drill-down SHALL preserve the Session Detail conversation context

#### Scenario: Session has no review artifacts
- **WHEN** the browser loads Session Detail for a session with no review artifacts
- **THEN** the timeline SHALL continue to show chat, live status, and approval state without an empty review section

### Requirement: Session review is not primary navigation
The system SHALL keep review evidence embedded in Session Detail rather than exposing a first-level Review destination in the first version.

#### Scenario: Browser shows primary navigation
- **WHEN** the app renders primary navigation
- **THEN** it SHALL NOT show Review as a first-level destination
- **AND** review drill-downs SHALL be reachable from session artifact cards

### Requirement: Session timeline renders Markdown message content
The system SHALL render session message content as sanitized Markdown in the session timeline while preserving the original raw text content in backend storage and API responses.

#### Scenario: Markdown text response is received
- **WHEN** Codex sends text response content containing Markdown structure
- **THEN** the backend SHALL forward and persist the raw text content without stripping Markdown syntax
- **AND** the browser SHALL render headings, lists, code, links, and inline formatting as Markdown in the assistant timeline message

#### Scenario: Markdown response streams
- **WHEN** live assistant text is arriving for a running prompt turn
- **THEN** the browser SHALL update the live assistant message through the Markdown-aware renderer
- **AND** incomplete Markdown SHALL not break the timeline layout or prevent subsequent text from rendering

#### Scenario: User prompt contains Markdown
- **WHEN** the user submits a prompt containing Markdown syntax
- **THEN** the browser SHALL show the submitted prompt in the timeline with the same Markdown safety constraints used for assistant messages
- **AND** the backend SHALL send the original prompt text to Codex unchanged

#### Scenario: Unsafe Markdown content is present
- **WHEN** a session message contains raw HTML, scripts, or unsupported Markdown content
- **THEN** the browser SHALL NOT execute unsafe content
- **AND** the readable text content SHALL remain visible when possible

### Requirement: Session timeline follows new content by default
The browser SHALL keep the newest session timeline content visible by default while the user remains at or near the bottom of the conversation.

#### Scenario: Session detail loads with existing messages
- **WHEN** the browser opens a session detail view containing enough timeline content to exceed the viewport height
- **THEN** the browser SHALL scroll to the newest visible timeline content
- **AND** the prompt composer SHALL remain reachable

#### Scenario: Prompt is submitted while timeline is following
- **WHEN** the user submits a prompt while the timeline is at or near the bottom
- **THEN** the browser SHALL keep the submitted prompt visible in the session timeline
- **AND** it SHALL continue following subsequent running or assistant content for that turn

#### Scenario: Assistant content streams while timeline is following
- **WHEN** live assistant text, tool activity, approval notices, or running placeholders are appended while the timeline is following
- **THEN** the browser SHALL scroll so the newest timeline content remains visible

### Requirement: Session timeline preserves user scroll position
The browser SHALL stop automatically scrolling the session timeline when the user intentionally scrolls away from the newest conversation content.

#### Scenario: User scrolls upward during a running turn
- **WHEN** the user scrolls upward so the newest timeline content is no longer visible
- **THEN** the browser SHALL pause automatic scrolling for subsequent timeline updates
- **AND** the user's current reading position SHALL remain stable as new content arrives

#### Scenario: New content arrives while auto-scroll is paused
- **WHEN** new timeline content is appended while the user is away from the bottom
- **THEN** the browser SHALL NOT move the viewport to the newest content automatically
- **AND** it SHALL provide a visible shortcut to return to the newest content

### Requirement: Session timeline can return to automatic following
The browser SHALL provide a shortcut back to the newest session timeline content and resume automatic following once the user reaches the bottom.

#### Scenario: User activates the return-to-bottom shortcut
- **WHEN** automatic scrolling is paused and the user activates the return-to-bottom shortcut
- **THEN** the browser SHALL scroll to the newest timeline content
- **AND** it SHALL restore automatic following for subsequent updates
- **AND** the shortcut SHALL no longer be shown after the bottom is reached

#### Scenario: User manually scrolls back to the bottom
- **WHEN** automatic scrolling is paused and the user manually scrolls until the newest timeline content is visible
- **THEN** the browser SHALL restore automatic following for subsequent updates
- **AND** it SHALL hide the return-to-bottom shortcut

### Requirement: Session detail exposes restoration state
The system SHALL include restoration state when returning Session Detail for persisted sessions.

#### Scenario: Browser opens a restorable session
- **WHEN** the browser loads Session Detail for a persisted session whose agent runtime context is not live but can be restored
- **THEN** the backend SHALL return the persisted workspace, session metadata, normalized timeline, and continuity metadata
- **AND** it SHALL identify that the session must be restored before new prompts can be sent

#### Scenario: Browser opens a restore-failed session
- **WHEN** the browser loads Session Detail for a session whose latest restore attempt failed
- **THEN** the backend SHALL return the persisted timeline for review
- **AND** it SHALL include a readable failure reason
- **AND** it SHALL keep the composer disabled for that session

### Requirement: User can restore a persisted session before prompting
The system SHALL allow a user to restore an eligible persisted session before submitting a new text prompt.

#### Scenario: User restores loadable session
- **WHEN** the user requests continuation for a loadable persisted session
- **THEN** the backend SHALL attempt to restore the agent runtime context through the verified agent continuation path
- **AND** the browser SHALL show that restoration is in progress

#### Scenario: Restore completes before prompting
- **WHEN** restoration completes successfully for a persisted session
- **THEN** the backend SHALL mark the session as continuable
- **AND** the browser SHALL enable prompt submission when the session is idle and has no pending approvals

#### Scenario: Prompt is submitted before restore completes
- **WHEN** the user attempts to submit a prompt while a session is restorable but not yet restored
- **THEN** the system SHALL reject the prompt
- **AND** the browser SHALL indicate that the session must be restored before continuing

### Requirement: Restored sessions preserve timeline continuity
The system SHALL preserve the existing local timeline while restoring agent runtime context.

#### Scenario: Restore replays existing history
- **WHEN** the agent replays history during restore
- **THEN** the backend SHALL reconcile replayed updates with the existing normalized timeline
- **AND** the browser SHALL not show duplicate messages, tool calls, approvals, or review cards

#### Scenario: Restore succeeds after backend restart
- **WHEN** a user restores a persisted session after backend restart
- **THEN** the browser SHALL continue showing the same local timeline
- **AND** any new prompt submitted after restore SHALL append to that session timeline

### Requirement: Session timeline keeps prompt input responsive with long history
The browser SHALL keep the prompt composer responsive while Session Detail renders a long persisted session timeline.

#### Scenario: User types while a long timeline is visible
- **WHEN** the browser opens a Session Detail view with enough persisted timeline items to create a long rendered conversation
- **AND** the prompt composer is enabled
- **AND** the user types normal prompt text into the composer
- **THEN** the composer SHALL update promptly without perceptible per-keystroke lag caused by timeline layout work
- **AND** the visible timeline ordering, newest-content follow behavior, and sticky composer reachability SHALL remain unchanged

#### Scenario: Long timeline includes rich content
- **WHEN** the long timeline contains Markdown messages, tool rows, review artifact cards, notices, or running placeholders
- **THEN** the browser SHALL continue to render those timeline items in their existing order and presentation
- **AND** typing into the composer SHALL remain responsive while those items are visible

### Requirement: Session Detail separates context, timeline, approval, and prompt entry
The browser SHALL render Session Detail as distinct regions so that session context, conversation history, blocking approval state, and prompt entry do not compete for the same visual surface.

#### Scenario: Session Detail renders for a live session
- **WHEN** the browser opens Session Detail for a live session
- **THEN** it SHALL show compact session context, including workspace, agent identity, mode, status, and review or diff actions, outside the prompt composer
- **AND** it SHALL keep the timeline focused on messages, notices, tool rows, approval notices, and review cards
- **AND** it SHALL keep the composer focused on prompt input and submission

#### Scenario: User scrolls a long session timeline
- **WHEN** the user scrolls through a Session Detail timeline that exceeds the viewport height
- **THEN** the prompt composer SHALL remain reachable
- **AND** enough session context SHALL remain visible or quickly reachable to identify the current session, agent, permission mode, and status

### Requirement: Pending approval minimizes prompt composer chrome
The browser SHALL reduce prompt composer prominence while a session is blocked on approval.

#### Scenario: Session waits for approval
- **WHEN** Session Detail has an active pending approval
- **THEN** the browser SHALL present the approval sheet or approval surface as the primary action area
- **AND** the composer SHALL be disabled or collapsed into a minimal blocked state that explains prompting is unavailable

#### Scenario: Approval is resolved
- **WHEN** the active pending approval is resolved and no additional approvals remain queued
- **THEN** the browser SHALL restore the normal compact prompt composer when the session returns to an idle continuable state
- **AND** the timeline SHALL preserve the approval result and subsequent assistant output in order

### Requirement: User can stop the active session turn
The system SHALL allow the user to request stopping the current active turn for a continuable session.

#### Scenario: Stop is requested during a running turn
- **WHEN** the user activates stop for a session with an active running turn
- **THEN** the backend SHALL route a stop or cancellation request through the session's owning agent runtime
- **AND** the browser SHALL show that the turn is stopping
- **AND** the system SHALL preserve already persisted messages, tool calls, approvals, and review artifacts

#### Scenario: Stop completes
- **WHEN** the owning agent confirms cancellation or the active turn otherwise ends after a stop request
- **THEN** the backend SHALL mark the active turn as stopped or idle according to the final agent state
- **AND** the browser SHALL remove the stopping indicator and show the resulting session state without requiring reload

#### Scenario: Stop is unavailable
- **WHEN** the session is not running or its owning agent runtime cannot accept a stop request
- **THEN** the backend SHALL reject the stop request with a readable reason
- **AND** the browser SHALL keep the timeline reviewable and show the reason without losing queued prompts

### Requirement: Active session work exposes elapsed time
The system SHALL expose enough turn timing data for the browser to display how long active session work has been running.

#### Scenario: Turn is running
- **WHEN** a session turn is running or waiting for approval within an active turn
- **THEN** session detail SHALL include the active turn start timestamp or equivalent elapsed-time source
- **AND** the browser SHALL display elapsed work time in minutes and seconds

#### Scenario: Browser reloads during active turn
- **WHEN** the browser reloads or reconnects during an active turn
- **THEN** the elapsed work time display SHALL continue from the persisted active turn timing data
- **AND** it SHALL NOT reset to zero solely because the page reloaded

#### Scenario: Turn finishes
- **WHEN** the active turn finishes, stops, or fails
- **THEN** the browser SHALL stop incrementing the active elapsed time display
- **AND** it SHALL show the final session state instead of an active work timer

### Requirement: Browser submits image prompt content
The system SHALL allow users to submit supported image content with a session prompt when the selected agent runtime supports ACP image prompt blocks.

#### Scenario: User sends text with images to an image-capable agent
- **WHEN** the user submits a non-empty text prompt with one or more supported image attachments to a continuable session whose owning runtime reports image prompt support
- **THEN** the backend SHALL persist the user message with ordered text and image content blocks
- **AND** it SHALL send the prompt to the ACP agent as ordered `ContentBlock` values including `type: "text"` and `type: "image"` blocks

#### Scenario: User sends images without text
- **WHEN** the user submits one or more supported image attachments without text to a continuable session whose owning runtime reports image prompt support
- **THEN** the backend SHALL accept the prompt
- **AND** it SHALL persist and send the image content blocks without requiring fallback text

#### Scenario: User attaches an unsupported image
- **WHEN** the user tries to submit an unsupported image MIME type or an image payload that exceeds configured limits
- **THEN** the backend SHALL reject the prompt with a readable validation error
- **AND** it SHALL NOT send the prompt to the ACP agent

#### Scenario: Runtime does not support image prompts
- **WHEN** the user tries to submit image attachments to a session whose owning runtime does not report image prompt support
- **THEN** the backend SHALL reject the prompt with a readable conflict error
- **AND** the browser SHALL keep text prompt submission available

### Requirement: Browser displays agent image content
The system SHALL display supported image content received from the selected ACP agent in the session timeline.

#### Scenario: Agent sends an image message chunk
- **WHEN** the selected agent sends supported image content for a session through `session/update`
- **THEN** the backend SHALL persist the assistant message with the image content block
- **AND** connected browsers SHALL render the image content in the timeline

#### Scenario: Agent sends mixed text and image content
- **WHEN** the selected agent sends text and supported image content for the same assistant message
- **THEN** the browser SHALL render both content types in message order
- **AND** the session history SHALL preserve enough structured content to render the same result after reload

### Requirement: Session prompts include display-image guidance
The system SHALL include agent-facing guidance for image display when prompting
an agent in a workspace session.

#### Scenario: Prompt includes image display affordance guidance
- **WHEN** a user submits a prompt to a session whose selected agent runtime can
  receive display-image guidance
- **THEN** the backend SHALL include guidance that the agent should call
  `display_image` when it creates, modifies, locates, captures, or references an
  image the user should inspect
- **AND** the user-visible prompt content SHALL remain unchanged in persisted
  session history

#### Scenario: Agent cannot receive display-image guidance
- **WHEN** the selected agent runtime cannot receive display-image guidance or
  tool affordance metadata
- **THEN** the backend SHALL continue sending the user's prompt normally
- **AND** session prompting SHALL NOT fail solely because image display guidance
  is unavailable

### Requirement: User can dictate prompt draft text
The browser SHALL allow the user to draft prompt text by voice in Session Detail when the composer is available and server-side audio transcription is configured.

#### Scenario: Voice transcript is inserted into draft
- **WHEN** the user starts voice input from an enabled Session Detail composer
- **AND** the browser records audio and the backend returns transcript text from the configured transcription provider
- **THEN** the browser SHALL insert the transcript into the current prompt draft
- **AND** it SHALL keep the draft editable in the composer textarea
- **AND** it SHALL NOT submit the prompt solely because transcription returned text

#### Scenario: Voice transcript appends to existing draft
- **WHEN** the prompt composer already contains draft text
- **AND** audio transcription returns transcript text
- **THEN** the browser SHALL preserve the existing draft text
- **AND** it SHALL append or insert the transcript with readable whitespace rather than concatenating words together

#### Scenario: User submits dictated prompt
- **WHEN** the prompt draft contains dictated text
- **AND** the user activates the existing Send action or Ctrl+Enter/Cmd+Enter shortcut
- **THEN** the browser SHALL submit or queue the prompt through the existing prompt submission flow
- **AND** the backend SHALL receive the resulting prompt as normal text prompt content

#### Scenario: Voice input stops before transcription
- **WHEN** the user stops voice input before submitting the recording for transcription
- **THEN** the browser SHALL stop recording audio
- **AND** it SHALL preserve any existing draft text for review and editing
- **AND** it SHALL NOT call the transcription API for the stopped recording

#### Scenario: Voice input is unavailable
- **WHEN** server-side transcription is not configured or the browser cannot record microphone audio
- **THEN** the browser SHALL keep normal text prompt entry usable
- **AND** it SHALL avoid presenting voice input as an action that can silently fail

#### Scenario: Voice input fails
- **WHEN** microphone permission is denied, audio recording fails, backend validation rejects the audio, or provider transcription fails
- **THEN** the browser SHALL leave voice input recording or transcribing state
- **AND** it SHALL show a recoverable composer-level error without discarding the current prompt draft

#### Scenario: Composer cannot accept prompting
- **WHEN** the visible session is not continuable, requires restoration, or otherwise disables prompt drafting
- **THEN** the browser SHALL disable or hide voice input consistently with other prompt composer actions
- **AND** voice input SHALL NOT create or submit a prompt for that session

### Requirement: Composer accepts pasted image attachments
The system SHALL allow supported image files pasted into the prompt composer to become prompt image attachments before submission.

#### Scenario: User pastes an image into the composer
- **WHEN** the user pastes a supported image file into an enabled composer for a session whose agent supports image prompts
- **THEN** the browser SHALL add the image to the composer attachments
- **AND** submitting the prompt SHALL send the image through the existing prompt content block pathway

#### Scenario: User pastes an unsupported image
- **WHEN** the user pastes a file whose MIME type or size is not supported by composer image attachments
- **THEN** the browser SHALL show a readable composer-level attachment error
- **AND** it SHALL preserve the current draft text and existing attachments

#### Scenario: Image prompts are unsupported
- **WHEN** the user pastes an image into a composer whose current agent connection does not support image prompts
- **THEN** the browser SHALL reject the image with a readable composer-level attachment error
- **AND** it SHALL NOT add the pasted image to the outgoing prompt

### Requirement: Composer accepts dropped image attachments
The system SHALL allow supported image files dropped onto the prompt composer to become prompt image attachments before submission.

#### Scenario: User drops an image on the composer
- **WHEN** the user drops a supported image file onto an enabled composer for a session whose agent supports image prompts
- **THEN** the browser SHALL add the image to the composer attachments
- **AND** the prompt draft and existing attachments SHALL remain available for editing before submission

#### Scenario: User drops unsupported files
- **WHEN** the user drops files that are not supported composer image attachments
- **THEN** the browser SHALL show a readable composer-level attachment error
- **AND** it SHALL preserve the current draft text and existing attachments

### Requirement: Composer previews attached images before sending
The system SHALL let users enlarge composer image attachments for inspection before submitting the prompt.

#### Scenario: User opens an attached image preview
- **WHEN** the user selects an image attachment thumbnail in the composer
- **THEN** the browser SHALL open a larger preview of that image
- **AND** the preview SHALL include enough context to identify the attachment

#### Scenario: User closes image preview
- **WHEN** the user closes an open composer image preview
- **THEN** the browser SHALL return to the same composer draft
- **AND** existing attachments SHALL remain attached unless the user explicitly removes them

