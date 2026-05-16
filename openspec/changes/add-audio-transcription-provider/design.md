## Context

Session Detail currently treats Mic as a browser speech recognition drafting tool. That keeps the backend simple, but it leaves reliability to browser-specific recognition services and can fail silently on mobile browsers that expose microphone activity without returning transcript text.

The desired path is provider-based transcription: the browser records audio, the backend validates and forwards it to a configured transcription provider, and the returned text is inserted into the existing prompt composer. The first provider targets externally deployed OpenAI-compatible transcription services so users can run faster-whisper or another compatible service outside this project.

## Goals / Non-Goals

**Goals:**

- Provide a backend transcription provider abstraction that can support additional providers later.
- Support an externally deployed OpenAI-compatible transcription endpoint as the first provider.
- Keep audio transcription independent from ACP prompt capabilities; Codex ACP does not need to support audio prompt blocks.
- Preserve the current user model that voice input drafts text and never submits automatically.
- Keep provider credentials and base URLs server-side.
- Validate audio payload size, MIME type, provider configuration, and provider response shape.

**Non-Goals:**

- Do not bundle, install, launch, supervise, or document a blessed faster-whisper distribution as part of the app runtime.
- Do not send audio blocks to ACP agents in this change.
- Do not keep Web Speech API as a fallback path in this change.
- Do not persist raw microphone audio in session history.
- Do not add streaming transcription; the first implementation transcribes a completed recording.

## Decisions

### Use a server-side transcription API

The browser will call a new authenticated backend transcription endpoint instead of calling the external transcription service directly.

Rationale: backend routing keeps provider URLs and optional API keys out of browser state, reuses existing auth and CSRF checks, centralizes validation, and lets future providers share a stable frontend contract.

Alternative considered: browser calls the local transcription service directly. That would avoid one backend hop but would expose local service details, duplicate auth/error handling in the frontend, and complicate mobile or remote browser access.

### Model providers around completed audio transcription

The provider interface should accept one completed audio payload plus optional language/model settings and return transcript text plus optional provider metadata.

Rationale: the immediate Mic workflow is "record, transcribe, insert". A completed-audio contract is easier to validate, test, retry, and integrate with OpenAI-compatible HTTP APIs.

Alternative considered: design for real-time streaming first. Streaming would improve latency for long dictation, but it introduces WebSocket state, partial transcript reconciliation, cancellation semantics, and provider-specific protocol differences before the basic reliability problem is solved.

### First provider is OpenAI-compatible, not faster-whisper-specific

The first concrete provider should send `multipart/form-data` to an OpenAI-compatible `/v1/audio/transcriptions` endpoint. Configuration supplies base URL, optional API key, model, optional language, timeout, and max audio size.

Rationale: many local faster-whisper deployments expose an OpenAI-compatible transcription API, and the same contract can also support hosted OpenAI-compatible providers later. Naming the provider after the protocol keeps the app independent from a specific deployment package.

Alternative considered: hard-code a specific faster-whisper server API. That would simplify one deployment path but would make the project responsible for another service's API choices and make future providers harder to add.

### Mic requires configured transcription

When no transcription provider is configured, the frontend should not present Mic as an available action.

Rationale: the current failure mode is an action that appears available but produces no useful result. Hiding or disabling Mic when transcription is unavailable gives a clear capability boundary.

Alternative considered: fall back to Web Speech API. The user explicitly chose not to keep that fallback, and it would preserve the unreliable path that triggered this change.

### Transcription inserts draft text only

Returned transcript text is appended to the composer draft using existing readable whitespace behavior. It is not submitted to the agent until the user sends it through the normal prompt flow.

Rationale: users should be able to review and edit dictated text before it affects an agent session. This also keeps queued prompt, permission, image attachment, template, and keyboard behavior unchanged.

Alternative considered: auto-submit on transcription completion. That would be faster for command dictation but too easy to trigger unintentionally after noisy or incorrect transcription.

## Risks / Trade-offs

- External provider is down or misconfigured -> return a readable composer-level error and keep any existing draft intact.
- Audio upload is too large or unsupported -> reject before provider dispatch with a clear validation error.
- Provider response shapes vary -> accept the OpenAI-compatible JSON `text` field in the first version and fail closed for unsupported responses.
- Local transcription service may be slow on first request -> use a configurable timeout and show a transcribing state while the request is pending.
- Remote browsers may not reach loopback-only external services -> browser talks only to ACP Web UI, while ACP Web UI calls the provider from the server machine; documentation should explain that the provider URL is resolved by the backend.
- Raw audio may contain sensitive speech -> do not persist raw audio, keep logs free of payloads, and document that configured external providers receive the recorded audio.

## Migration Plan

1. Add configuration and provider plumbing with transcription disabled by default.
2. Add the backend transcription endpoint and tests using a local mock OpenAI-compatible server.
3. Replace the frontend voice adapter with MediaRecorder recording and backend transcription states.
4. Update public documentation with generic OpenAI-compatible configuration examples and no machine-specific paths or hostnames.
5. Rollback is disabling the provider configuration; Mic disappears while text prompt entry remains unchanged.

## Open Questions

- Which audio MIME types should the first frontend path prefer across Chromium, Safari, and Firefox: `audio/webm`, `audio/ogg`, or `audio/mp4`?
- Should language be a global config value only, or should the UI later allow per-recording language selection?
