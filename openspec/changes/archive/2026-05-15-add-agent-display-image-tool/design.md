## Context

ACP Web UI already supports image content blocks in prompts and assistant
messages when the agent emits structured ACP image content. The missing path is
agent-produced files: agents commonly create screenshots or generated images on
disk and then describe the path as text, so the user does not see the image in
the session.

ACP core supports content blocks, client filesystem methods, tool-call updates,
and extension methods. It does not define a generic client-side tool registry.
For model-visible tools, MCP-style tool exposure is the better integration
point where an agent runtime can consume it. ACP extension metadata can still be
used as a capability signal for adapters that know how to bridge client
affordances into agent-visible tools.

## Goals / Non-Goals

**Goals:**

- Give agents a model-visible `display_image` affordance with clear usage
  guidance.
- Persist displayed images as session evidence instead of relying on the source
  file path for future reloads.
- Validate image paths against the session workspace and image constraints.
- Render image evidence inline in the timeline and in the artifact drill-down.
- Provide a conservative fallback for plain-text image paths from agents that do
  not call the explicit affordance.

**Non-Goals:**

- General-purpose arbitrary client tool registration for all ACP agents.
- Remote image fetching from arbitrary URLs.
- Editing or generating images inside ACP Web UI.
- Serving arbitrary local files outside the session workspace.

## Decisions

### Use a first-class display-image artifact path

The display action will produce a session review artifact with kind `image` and
a payload containing MIME type, base64 data, display name, optional caption, and
source path metadata. This keeps image evidence durable and reuses the existing
review artifact list/detail APIs and realtime artifact notifications.

Alternative considered: add image blocks directly to assistant messages only.
That gives a nice transcript but loses the evidence drill-down model and makes
tool-origin metadata harder to preserve. The implementation can still synthesize
inline timeline rendering from the artifact.

### Prefer a model-visible MCP tool

The primary integration should expose a `display_image` MCP tool to agent
runtimes by passing an ACP `mcpServers` entry during `session/new` and
`session/load`. The tool description must explicitly say when to use it: after
creating, modifying, locating, capturing, or referencing an image the user
should inspect.

Alternative considered: hidden prompt text. Browser validation showed this can
be replayed as visible user transcript content during session restore, and
without a real callable tool the model can only describe the path or invent a
call syntax. Hidden prompt injection should not be used for this feature.

### Advertise ACP Web UI display capability as an extension

The ACP initialize request can advertise an `acp-webui` extension under
`clientCapabilities._meta` so compatible adapters can detect that the client
supports display-image behavior. If an agent calls a matching extension request,
the backend can handle it like the tool path. Unknown agents will ignore it.

Alternative considered: use only a custom ACP method. This is less portable
because generic agents do not automatically expose client methods as model
tools.

### Validate and snapshot files before display

The backend must resolve the requested path under the session workspace, reject
paths outside that workspace, reject directories and unsupported image MIME
types, and enforce a bounded file size before reading the image. The stored
artifact contains a snapshot of the image bytes, not just a pointer to the file.

### Use conservative text-path enrichment as fallback

When an assistant message or tool output contains a safe workspace-local image
path and no explicit display-image artifact was created, the backend may derive
an image artifact automatically. This fallback should be narrow: only local
workspace paths with known image extensions or MIME detection, and no remote
URLs.

## Risks / Trade-offs

- Model-visible tools vary by agent runtime -> expose the tool where supported,
  add hidden guidance, and keep text-path enrichment as a fallback.
- Image payloads can increase storage size -> enforce size limits and store
  bounded image snapshots.
- Path parsing can misidentify text as file paths -> keep fallback conservative
  and require workspace containment plus image validation.
- Displaying files may leak local machine details -> store a neutral display
  name and source metadata without exposing machine-specific absolute paths in
  the primary UI.
- Existing artifact drill-down is text/diff oriented -> add image-specific
  rendering while keeping raw payload diagnostics secondary.
