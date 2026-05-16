## 1. Backend Configuration and Provider

- [ ] 1.1 Add transcription configuration parsing for provider id, base URL, optional API key, model, optional language, timeout, and max audio size.
- [ ] 1.2 Expose transcription availability through a display-safe capability surface without leaking provider secrets.
- [ ] 1.3 Define a backend transcription provider interface for completed audio payloads and transcript results.
- [ ] 1.4 Implement the OpenAI-compatible transcription provider using multipart form upload and the configured provider settings.
- [ ] 1.5 Add backend unit tests for configuration defaults, secret redaction, provider request construction, authorization handling, success responses, provider errors, timeouts, and unsupported response shapes.

## 2. Backend API

- [ ] 2.1 Add an authenticated audio transcription endpoint that accepts recorded audio outside the session prompt flow.
- [ ] 2.2 Validate audio MIME type, empty payloads, and configured maximum audio size before provider dispatch.
- [ ] 2.3 Return normalized transcript success and readable validation or provider failure responses.
- [ ] 2.4 Add backend API tests for configured and unconfigured transcription, authentication, validation rejection, provider success, and provider failure.

## 3. Frontend Recording Flow

- [ ] 3.1 Replace the Web Speech adapter path with MediaRecorder-based recording state for Mic.
- [ ] 3.2 Add frontend API support for uploading recorded audio to the backend transcription endpoint.
- [ ] 3.3 Insert returned transcript text into the existing composer draft without submitting a prompt.
- [ ] 3.4 Keep Mic unavailable when server-side transcription is not configured or browser recording support is missing.
- [ ] 3.5 Preserve existing composer behavior for text editing, keyboard submit, queued prompts, image attachments, prompt templates, skill autocomplete, and disabled states.

## 4. Frontend Verification

- [ ] 4.1 Update frontend tests to mock recording support and successful backend transcription.
- [ ] 4.2 Add tests for unconfigured transcription and missing browser recording support.
- [ ] 4.3 Add tests for microphone denial, recording failure, backend validation failure, and provider transcription failure.
- [ ] 4.4 Add regression coverage that voice transcription does not auto-submit and does not discard existing draft text.

## 5. Documentation and Validation

- [ ] 5.1 Add an optional Docker Compose example for an externally managed OpenAI-compatible faster-whisper service using loopback binding and Docker-managed model cache.
- [ ] 5.2 Document external OpenAI-compatible transcription provider configuration with generic placeholders only.
- [ ] 5.3 Document that the project does not install, run, supervise, require, or update faster-whisper services as part of ACP Web UI runtime.
- [ ] 5.4 Run backend tests, frontend tests, public-source checks, formatting checks, and a release build.
- [ ] 5.5 Manually verify a configured external transcription provider can record, transcribe, insert draft text, and leave prompt submission under user control.
