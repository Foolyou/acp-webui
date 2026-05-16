## Why

The current voice input depends on browser speech recognition, which can appear to record while never producing usable transcript text on some mobile browsers. We need a reliable voice drafting path that records audio in the browser, delegates transcription to a configured backend provider, and keeps external speech infrastructure outside this project.

## What Changes

- Add a backend audio transcription provider abstraction with a first provider that calls an externally deployed OpenAI-compatible transcription API.
- Add a session-independent transcription API that accepts recorded audio from the browser, validates it, sends it to the configured provider, and returns transcript text.
- Replace the composer Mic path with MediaRecorder-based recording and backend transcription when transcription is configured.
- Do not support Web Speech API fallback in this change.
- Do not install, launch, supervise, or require faster-whisper or any other local transcription service as part of the ACP Web UI runtime.
- Add an optional Docker Compose example for an externally managed OpenAI-compatible faster-whisper transcription service.
- Keep voice input as a draft tool: transcribed text is inserted into the composer and is never submitted automatically.

## Capabilities

### New Capabilities

- `audio-transcription-provider`: Configured backend transcription providers, request validation, external OpenAI-compatible provider behavior, and provider error handling.

### Modified Capabilities

- `workspace-session-chat`: Voice input behavior changes from browser speech recognition to server-backed audio transcription while preserving composer draft semantics.
- `react-frontend-application`: Frontend coverage must verify MediaRecorder voice transcription behavior and preservation of existing composer workflows.

## Impact

- Backend configuration parsing for transcription provider settings, base URL, optional API key, model, language, timeout, and audio size limits.
- New authenticated backend API for audio transcription.
- New backend provider interface and OpenAI-compatible HTTP multipart client.
- Frontend Mic control, recording state, transcription state, errors, and API client support.
- Frontend and backend tests for configured, unconfigured, validation, provider success, provider failure, and composer workflow behavior.
- Public documentation and optional compose example for configuring an externally deployed OpenAI-compatible transcription service without committing local machine details.
