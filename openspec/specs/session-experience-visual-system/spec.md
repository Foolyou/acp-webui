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
The frontend SHALL render tool call timeline items as compact Codex-like transcript rows by default.

#### Scenario: Tool call appears in timeline
- **WHEN** a tool call timeline item is available
- **THEN** the app SHALL render a thin row with an action label, subject, compact summary, and status
- **AND** the app SHALL avoid showing raw JSON by default

#### Scenario: Common tool call display data is available
- **WHEN** a tool call represents a recognizable command, file read, file edit, search, list, browser, or MCP-style operation
- **THEN** the app SHALL prefer a concise Codex-like action label and subject derived from the structured tool data
- **AND** unknown tool shapes SHALL fall back to the existing tool kind, title, summary, and status

#### Scenario: User expands tool call
- **WHEN** the user expands a tool call row
- **THEN** the app SHALL show available parameters, bounded output snippets, linked review artifacts if present, and explicit raw payload access
- **AND** raw input/output payloads SHALL remain hidden behind an inspection affordance until requested

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

