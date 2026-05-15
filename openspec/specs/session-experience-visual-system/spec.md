# session-experience-visual-system Specification

## Purpose
TBD - created by archiving change redesign-session-workspace-experience. Update Purpose after archive.
## Requirements
### Requirement: Frontend uses accessible React interaction primitives
The frontend SHALL use accessible React component primitives for overlays and interactive controls introduced by the redesign.

#### Scenario: Dialog or sheet is opened
- **WHEN** the app opens an approval, review, or navigation overlay
- **THEN** focus SHALL move into the overlay
- **AND** the overlay SHALL provide keyboard dismissal where appropriate and a fixed close affordance

#### Scenario: Overlay content scrolls
- **WHEN** overlay content is taller than the viewport
- **THEN** the close control and primary header or footer controls SHALL remain reachable without requiring the user to scroll to the top

### Requirement: Visual system uses restrained theme tokens
The frontend SHALL use a custom tokenized visual system with restrained neutral styling.

#### Scenario: App shell renders
- **WHEN** the app renders any primary route
- **THEN** surfaces, text, borders, focus rings, statuses, and actions SHALL use semantic CSS tokens
- **AND** the token naming SHALL allow dark mode to be added later without restructuring components

#### Scenario: Primary and secondary actions render
- **WHEN** action buttons are displayed
- **THEN** only primary user actions SHALL use strong filled styling
- **AND** secondary actions SHALL use lighter visual treatment

### Requirement: Session creation shows optimistic chat loading
The frontend SHALL show an optimistic chat shell while a new Codex session is being created.

#### Scenario: User starts session creation
- **WHEN** the user starts creating a new session from a workspace
- **THEN** the app SHALL immediately show a session chat shell with skeleton or loading state
- **AND** it SHALL communicate that Codex is starting the session

#### Scenario: Session creation succeeds
- **WHEN** the backend returns the created session
- **THEN** the app SHALL replace the transient loading state with the real session detail route
- **AND** it SHALL not require the user to manually select the new session

#### Scenario: Session creation fails
- **WHEN** session creation fails
- **THEN** the app SHALL remove the transient loading state
- **AND** it SHALL show a readable error and a retry path without leaving a fake session in the list

### Requirement: Running state remains visible during prompt turns
The frontend SHALL keep prompt turn running state visible even when the user scrolls the timeline.

#### Scenario: Prompt turn is running without assistant text yet
- **WHEN** a session turn is running and no assistant text has arrived
- **THEN** the timeline end SHALL show a skeleton or loading item
- **AND** a compact status row above the composer SHALL indicate that Codex is working

#### Scenario: Prompt turn streams assistant text
- **WHEN** live assistant text is arriving
- **THEN** the timeline end SHALL show the live assistant content
- **AND** the composer-adjacent status row SHALL remain visible until the turn completes or waits for approval

### Requirement: Tool calls render as compact expandable timeline rows
The frontend SHALL render tool call timeline items as compact Codex-like transcript rows by default, grouping consecutive tool calls into a single expandable activity row when appropriate.

#### Scenario: Single tool call appears in timeline
- **WHEN** one tool call timeline item appears without an adjacent tool call in the same consecutive run
- **THEN** the app SHALL render a thin transcript row with a concise action label and subject such as `Ran npm run build`
- **AND** the app SHALL avoid showing raw JSON by default

#### Scenario: Consecutive tool calls appear in timeline
- **WHEN** two or more tool call timeline items appear consecutively in the normalized timeline
- **THEN** the app SHALL render one collapsed grouped row summarizing the run, such as `Ran 4 commands`
- **AND** the app SHALL provide an expand affordance that reveals each underlying tool call in timeline order

#### Scenario: Group contains mixed tool activity
- **WHEN** consecutive tool calls include multiple recognizable activity categories
- **THEN** the grouped row SHALL summarize the dominant categories with concise Codex-like labels
- **AND** unknown tool shapes SHALL fall back to generic tool labels without preventing the group from rendering

#### Scenario: Group contains failed tool activity
- **WHEN** any tool call in a grouped row has a failed status
- **THEN** the collapsed group summary SHALL expose that failure state or failure count
- **AND** expanding the group SHALL expose the failed tool's bounded output or diagnostic access when available

#### Scenario: User expands tool call group
- **WHEN** the user expands a grouped tool activity row
- **THEN** the app SHALL show the individual tool calls with concise subjects, status, available output snippets, linked review artifacts if present, and explicit raw payload access
- **AND** raw input/output payloads SHALL remain hidden behind an inspection affordance until requested

#### Scenario: Common tool call display data is available
- **WHEN** a tool call represents a recognizable command, file read, file edit, search, list, browser, or MCP-style operation
- **THEN** the app SHALL prefer a concise Codex-like action label and subject derived from the structured tool data
- **AND** unknown tool shapes SHALL fall back to the existing tool kind, title, summary, and status

### Requirement: Prompt composer supports desktop keyboard submission
The prompt composer SHALL support desktop keyboard submission without changing multiline text entry.

#### Scenario: Desktop user presses submit shortcut
- **WHEN** the focused composer receives Ctrl+Enter or Cmd+Enter outside of IME composition and the session can accept prompts
- **THEN** the app SHALL submit the prompt

#### Scenario: User presses Enter
- **WHEN** the focused composer receives Enter without the submit modifier
- **THEN** the app SHALL insert or preserve a newline instead of submitting

#### Scenario: Composer hint is displayed on desktop
- **WHEN** the composer renders on a desktop layout
- **THEN** it SHALL show a lightweight shortcut hint
- **AND** the hint SHALL be hidden on mobile layouts

### Requirement: Timeline message typography supports Markdown
The frontend SHALL style rendered Markdown in session timeline messages so structured Codex responses remain readable within chat bubbles and live streaming content.

#### Scenario: Message contains structured Markdown
- **WHEN** a session timeline message contains paragraphs, headings, lists, links, inline code, or fenced code blocks
- **THEN** the message bubble SHALL render those elements with compact chat-appropriate spacing and typography
- **AND** the rendered content SHALL stay within the message container on desktop and mobile viewports

#### Scenario: Message contains long code or links
- **WHEN** a rendered Markdown message contains long code, long links, or long unbroken text
- **THEN** the message bubble SHALL prevent horizontal page overflow
- **AND** code blocks SHALL remain inspectable without overlapping adjacent content

### Requirement: Workbench surfaces use compact operational density
The frontend SHALL use compact density for recurring workbench surfaces where users scan, compare, or repeatedly act on session state.

#### Scenario: Operational workbench surface renders
- **WHEN** the app renders Session Detail, Sessions list, Inbox, mobile navigation, approval, or review surfaces
- **THEN** repeated controls, status badges, list rows, tool rows, and navigation items SHALL use compact spacing appropriate for an operational tool
- **AND** empty states or focused creation flows MAY use more comfortable spacing without making recurring controls oversized

#### Scenario: Responsive layout renders on mobile
- **WHEN** the app renders on a mobile-width viewport
- **THEN** primary workbench controls SHALL remain reachable without causing horizontal overflow
- **AND** no persistent control group SHALL consume disproportionate vertical space when it is not the primary task surface

### Requirement: Prompt composer remains focused and compact
The prompt composer SHALL prioritize prompt entry and sending rather than serving as a general session configuration or status panel.

#### Scenario: Composer renders for an idle continuable session
- **WHEN** Session Detail renders for an idle continuable session
- **THEN** the composer SHALL show prompt text entry, send affordance, and keyboard hint where appropriate
- **AND** session configuration controls SHALL NOT be embedded as a permanent full-height section inside the composer

#### Scenario: Composer renders on mobile
- **WHEN** the mobile Session Detail composer is visible
- **THEN** it SHALL preserve useful timeline space above it
- **AND** its send action SHALL align with the prompt input without creating an extra mostly empty row

### Requirement: Review and approval overlays avoid unused visual space
The frontend SHALL present review and approval overlays with content-led spacing and persistent access to primary controls.

#### Scenario: Review overlay opens
- **WHEN** a user opens a review artifact
- **THEN** the overlay SHALL show a compact header, artifact summary, and artifact content without a large empty gap between summary and content
- **AND** raw payload details SHALL remain available without being the only prominent content layout

#### Scenario: Approval overlay opens
- **WHEN** a pending approval is active
- **THEN** the approval surface SHALL make the approval title, command context, and resolution actions the primary visible controls
- **AND** unrelated disabled prompt controls SHALL NOT visually compete with the approval actions

### Requirement: Tool activity uses Codex-like compact transcript rows
The frontend SHALL render tool call timeline items as compact activity rows that prioritize action, subject, status, and outcome over raw payload structure.

#### Scenario: Tool activity row renders collapsed
- **WHEN** a tool call timeline item is available in Session Detail
- **THEN** the browser SHALL render a collapsed row with a user-facing action label, bounded subject, status, and compact result text
- **AND** the row SHALL not show raw JSON input or output by default

#### Scenario: Recognizable tool activity is classified
- **WHEN** a tool call represents command execution, file change, file read, search, browser activity, MCP activity, or another recognizable tool category
- **THEN** the browser SHALL render a category-appropriate label and subject derived from normalized display data or bounded payload parsing
- **AND** the row SHALL remain understandable without requiring the user to expand diagnostics

#### Scenario: Unknown tool activity falls back safely
- **WHEN** a tool call cannot be classified into a known display category
- **THEN** the browser SHALL render a generic tool activity row using the available tool kind, title, summary, and status
- **AND** diagnostics SHALL remain available for raw input and output inspection

### Requirement: Tool activity rows are mobile-friendly
The frontend SHALL optimize tool activity rows for narrow mobile viewports without turning the session timeline into a wall of large cards.

#### Scenario: Long command or path appears on mobile
- **WHEN** a mobile-width viewport renders a tool activity row with a long command, path, URL, query, or MCP identifier
- **THEN** the row SHALL bound, wrap, clamp, or scroll only the affected inline value so the page does not overflow horizontally
- **AND** the status and primary evidence actions SHALL remain visible and reachable

#### Scenario: Multiple tool activity rows appear in one turn
- **WHEN** a session turn contains several consecutive tool activity rows
- **THEN** the browser SHALL use compact spacing and restrained borders so the rows scan as transcript activity rather than repeated heavy cards
- **AND** chat messages, approval notices, and review evidence SHALL remain visually distinguishable from tool activity

#### Scenario: Tool activity row contains evidence actions on mobile
- **WHEN** a tool activity row has output, diff, Markdown, terminal, artifact, or diagnostics actions
- **THEN** the action controls SHALL wrap within the row, preserve touch-target usability, and avoid overlapping adjacent content
- **AND** the row SHALL remain readable without requiring horizontal page scrolling

### Requirement: Tool activity diagnostics are explicit and secondary
The frontend SHALL preserve raw tool input and output access through an explicit diagnostics affordance while keeping diagnostics secondary to the main transcript.

#### Scenario: User opens diagnostics
- **WHEN** the user activates diagnostics for a tool activity row
- **THEN** the browser SHALL show raw input and output payloads in a bounded inspection surface
- **AND** the user SHALL be able to return to the timeline without losing Session Detail context

#### Scenario: Tool activity has large raw payloads
- **WHEN** raw input or output payloads are larger than the visible mobile viewport
- **THEN** diagnostics SHALL be scrollable or otherwise bounded within the inspection surface
- **AND** close or collapse controls SHALL remain reachable

### Requirement: Session timeline renders displayed image evidence
The frontend SHALL render displayed image evidence as visual content in Session
Detail rather than only as a file path or raw payload.

#### Scenario: Image evidence appears in timeline
- **WHEN** Session Detail receives a timeline item or artifact summary for image
  evidence
- **THEN** the browser SHALL render an inline image preview with concise title or
  caption text when available
- **AND** it SHALL provide access to the existing session-scoped artifact
  drill-down

#### Scenario: Image evidence is linked to tool activity
- **WHEN** an image artifact is linked to a visible tool activity row or grouped
  tool activity row
- **THEN** the browser SHALL keep the image reachable from that tool row's
  evidence actions
- **AND** it SHALL avoid duplicating the same image as an unrelated heavy card
  when the linked tool row is already visible

#### Scenario: Image preview renders on mobile
- **WHEN** a mobile-width viewport renders image evidence
- **THEN** the preview SHALL fit within the message or timeline container
- **AND** it SHALL NOT cause horizontal page overflow or overlap the composer,
  tool rows, or adjacent messages

### Requirement: Image artifact drill-down renders a preview
The frontend SHALL provide an image-specific review artifact drill-down.

#### Scenario: Image artifact opens
- **WHEN** the user opens an image artifact from the timeline or a tool evidence
  action
- **THEN** the review overlay SHALL render the image preview as the primary
  content
- **AND** title, caption, source metadata, and raw payload diagnostics SHALL
  remain secondary to the visual preview

#### Scenario: Image artifact cannot be previewed
- **WHEN** the artifact payload is missing image data or contains an unsupported
  image MIME type
- **THEN** the browser SHALL show a readable fallback
- **AND** it SHALL preserve access to raw artifact diagnostics

