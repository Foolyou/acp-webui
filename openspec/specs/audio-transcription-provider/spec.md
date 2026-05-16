# audio-transcription-provider Specification

## Purpose
TBD - created by archiving change add-audio-transcription-provider. Update Purpose after archive.
## Requirements
### Requirement: Backend exposes configured audio transcription capability
The system SHALL expose whether server-side audio transcription is configured without revealing provider secrets.

#### Scenario: Transcription provider is configured
- **WHEN** the browser requests application state or another capability surface used by Session Detail
- **THEN** the backend SHALL indicate that audio transcription is available
- **AND** it SHALL NOT expose API keys, authorization headers, resolved local paths, or other secret provider configuration

#### Scenario: Transcription provider is not configured
- **WHEN** no transcription provider is configured
- **THEN** the backend SHALL indicate that audio transcription is unavailable
- **AND** the browser SHALL be able to keep normal text prompt entry usable without offering a broken Mic action

### Requirement: Backend validates audio transcription requests
The system SHALL validate browser-submitted audio before dispatching it to a transcription provider.

#### Scenario: Supported audio is submitted
- **WHEN** an authenticated browser submits supported recorded audio within the configured size limit
- **THEN** the backend SHALL accept the request for provider transcription
- **AND** it SHALL pass the audio MIME type and bytes to the configured transcription provider

#### Scenario: Unsupported audio is submitted
- **WHEN** an authenticated browser submits audio with an unsupported MIME type, an empty body, or a payload larger than the configured limit
- **THEN** the backend SHALL reject the request with a readable validation error
- **AND** it SHALL NOT call the configured transcription provider

#### Scenario: Unauthenticated transcription request is submitted
- **WHEN** a browser without valid access submits audio for transcription
- **THEN** the backend SHALL reject the request using the same authentication policy as other protected API requests
- **AND** it SHALL NOT call the configured transcription provider

### Requirement: OpenAI-compatible transcription provider transcribes audio
The system SHALL support an OpenAI-compatible transcription provider backed by an externally deployed service.

#### Scenario: Provider returns transcript text
- **WHEN** the configured OpenAI-compatible provider returns a successful JSON response containing transcript text
- **THEN** the backend SHALL return that transcript text to the browser
- **AND** it SHALL omit raw provider secrets and raw audio bytes from the response

#### Scenario: Provider requires authorization
- **WHEN** the provider is configured with an API key
- **THEN** the backend SHALL include the configured authorization when calling the provider
- **AND** it SHALL NOT expose the key to the browser

#### Scenario: Provider fails
- **WHEN** the configured provider returns an error, times out, or returns an unsupported response shape
- **THEN** the backend SHALL return a readable transcription failure to the browser
- **AND** it SHALL NOT create or submit any agent prompt

### Requirement: External transcription service lifecycle is out of scope
The system SHALL treat local or hosted transcription services as externally managed dependencies.

#### Scenario: User configures local faster-whisper service
- **WHEN** a user configures an externally deployed OpenAI-compatible faster-whisper service as the transcription provider
- **THEN** the backend SHALL call that service through the provider configuration
- **AND** the application SHALL NOT install, launch, supervise, restart, or update that service

#### Scenario: Provider service is unavailable at startup
- **WHEN** the configured provider service is unavailable during app startup
- **THEN** the application SHALL still start normally
- **AND** transcription attempts SHALL fail with a readable provider error until the external service is available

### Requirement: Repository may include optional transcription provider deployment examples
The system SHALL treat any repository-provided transcription provider deployment examples as optional, externally managed examples rather than ACP Web UI runtime dependencies.

#### Scenario: Optional compose example is provided
- **WHEN** the repository includes a Docker Compose example for an OpenAI-compatible faster-whisper transcription service
- **THEN** the example SHALL bind exposed service ports to loopback by default
- **AND** it SHALL use generic placeholders or Docker-managed volumes rather than user-specific host paths
- **AND** it SHALL document that users start, stop, update, and operate the service independently from ACP Web UI

#### Scenario: ACP Web UI starts normally without compose service
- **WHEN** the optional compose example has not been started
- **THEN** ACP Web UI SHALL still start normally
- **AND** transcription availability SHALL depend only on the configured provider endpoint, not on the presence of the example files

