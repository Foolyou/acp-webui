# Speaches Transcription Example

This directory contains an optional Docker Compose example for running Speaches
as an externally managed OpenAI-compatible transcription provider for ACP Web UI.

ACP Web UI does not install, start, stop, restart, update, or supervise this
service. Start and operate it separately, then point ACP Web UI at its
OpenAI-compatible `/v1/audio/transcriptions` API.

## Start

```bash
docker compose up -d
```

The example binds the provider to loopback on host port `7322`:

```text
http://127.0.0.1:7322/v1
```

Model files are cached in the Docker-managed `speaches-hf-cache` volume.

## CPU Variant

The default compose file uses the CUDA image and requests GPU access. To test on
CPU, change the image to:

```yaml
image: ghcr.io/speaches-ai/speaches:latest-cpu
```

Then remove the `gpus: all` line.

## ACP Web UI Configuration

When ACP Web UI transcription support is enabled, configure it with:

```bash
ACP_WEBUI_TRANSCRIPTION_PROVIDER=openai-compatible
ACP_WEBUI_TRANSCRIPTION_BASE_URL=http://127.0.0.1:7322/v1
ACP_WEBUI_TRANSCRIPTION_MODEL=Systran/faster-whisper-large-v3
```

Leave `ACP_WEBUI_TRANSCRIPTION_LANGUAGE` unset when you commonly dictate in
both Chinese and English so Speaches can auto-detect the language. Set it to
`zh` or `en` only for single-language deployments.

If your provider requires a token, also set:

```bash
ACP_WEBUI_TRANSCRIPTION_API_KEY=<provider-token>
```

Do not expose this provider on a broad network interface unless you have added
your own access controls.
