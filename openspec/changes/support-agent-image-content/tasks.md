## 1. Data Model and API

- [ ] 1.1 Add shared structured message content types for text and supported image blocks.
- [ ] 1.2 Add migrations and storage support for optional message and queued prompt content blocks while preserving text fallback fields.
- [ ] 1.3 Extend prompt request/response and realtime timeline payloads to carry optional content blocks.

## 2. ACP Runtime

- [ ] 2.1 Parse and expose `agentCapabilities.promptCapabilities.image` from ACP initialize responses.
- [ ] 2.2 Build ACP `session/prompt` requests from ordered text and image content blocks with server-side validation.
- [ ] 2.3 Persist supported non-text ACP message chunks and preserve mixed text/image assistant output order.

## 3. Frontend Experience

- [ ] 3.1 Add capability-gated image attachment controls to the session composer with MIME and size validation.
- [ ] 3.2 Render structured message content blocks in persisted and realtime session timeline messages.
- [ ] 3.3 Preserve text-only behavior for sessions and agents without image prompt support.

## 4. Verification

- [ ] 4.1 Add backend tests for capability discovery, prompt block forwarding, validation, queued prompts, and image output persistence.
- [ ] 4.2 Add frontend tests for composer validation and timeline image rendering.
- [ ] 4.3 Run OpenSpec validation plus Rust and frontend test suites relevant to this change.
