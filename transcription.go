package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"path"
	"strings"
	"time"
)

const (
	defaultTranscriptionTimeout       = 60 * time.Second
	defaultTranscriptionMaxAudioBytes = 25 * 1024 * 1024
)

type TranscriptionRequest struct {
	MimeType string
	FileName string
	Data     []byte
}

type TranscriptionResult struct {
	Text string
}

type TranscriptionProvider interface {
	Transcribe(ctx context.Context, request TranscriptionRequest) (TranscriptionResult, error)
}

type openAICompatibleTranscriptionProvider struct {
	endpoint string
	apiKey   string
	model    string
	language string
	client   *http.Client
}

func newTranscriptionProvider(config Config) TranscriptionProvider {
	if !config.TranscriptionAvailable() {
		return nil
	}
	return newOpenAICompatibleTranscriptionProvider(config)
}

func newOpenAICompatibleTranscriptionProvider(config Config) TranscriptionProvider {
	timeout := config.TranscriptionTimeout
	if timeout <= 0 {
		timeout = defaultTranscriptionTimeout
	}
	return &openAICompatibleTranscriptionProvider{
		endpoint: transcriptionEndpoint(config.TranscriptionBaseURL),
		apiKey:   config.TranscriptionAPIKey,
		model:    defaulted(config.TranscriptionModel, defaultTranscriptionModel),
		language: strings.TrimSpace(config.TranscriptionLanguage),
		client:   &http.Client{Timeout: timeout},
	}
}

func (p *openAICompatibleTranscriptionProvider) Transcribe(ctx context.Context, request TranscriptionRequest) (TranscriptionResult, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, escapeMultipartFilename(defaulted(request.FileName, "recording"))))
	header.Set("Content-Type", request.MimeType)
	file, err := writer.CreatePart(header)
	if err != nil {
		return TranscriptionResult{}, err
	}
	if _, err := file.Write(request.Data); err != nil {
		return TranscriptionResult{}, err
	}
	if err := writer.WriteField("model", p.model); err != nil {
		return TranscriptionResult{}, err
	}
	if p.language != "" {
		if err := writer.WriteField("language", p.language); err != nil {
			return TranscriptionResult{}, err
		}
	}
	if err := writer.WriteField("response_format", "json"); err != nil {
		return TranscriptionResult{}, err
	}
	if err := writer.Close(); err != nil {
		return TranscriptionResult{}, err
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, body)
	if err != nil {
		return TranscriptionResult{}, err
	}
	httpRequest.Header.Set("Content-Type", writer.FormDataContentType())
	if p.apiKey != "" {
		httpRequest.Header.Set("Authorization", "Bearer "+p.apiKey)
	}
	response, err := p.client.Do(httpRequest)
	if err != nil {
		return TranscriptionResult{}, fmt.Errorf("Transcription provider failed: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if err != nil {
		return TranscriptionResult{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return TranscriptionResult{}, fmt.Errorf("Transcription provider failed with status %d", response.StatusCode)
	}
	var payload struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return TranscriptionResult{}, fmt.Errorf("unsupported transcription response")
	}
	text := strings.TrimSpace(payload.Text)
	if text == "" {
		return TranscriptionResult{}, fmt.Errorf("unsupported transcription response")
	}
	return TranscriptionResult{Text: text}, nil
}

func transcriptionEndpoint(baseURL string) string {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return strings.TrimRight(baseURL, "/") + "/audio/transcriptions"
	}
	if strings.HasSuffix(parsed.Path, "/audio/transcriptions") {
		return parsed.String()
	}
	parsed.Path = path.Join(parsed.Path, "audio", "transcriptions")
	return parsed.String()
}

func supportedTranscriptionAudioType(mimeType string) bool {
	switch strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0])) {
	case "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav":
		return true
	default:
		return false
	}
}

func escapeMultipartFilename(value string) string {
	return strings.NewReplacer("\\", "\\\\", `"`, `\"`, "\r", "", "\n", "").Replace(value)
}
