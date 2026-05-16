package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestOpenAICompatibleTranscriptionProviderSendsMultipartRequest(t *testing.T) {
	requestSeen := make(chan struct {
		auth        string
		model       string
		language    string
		fileContent string
	}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/transcriptions" {
			t.Fatalf("path = %q, want /v1/audio/transcriptions", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1024); err != nil {
			t.Fatal(err)
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil {
			t.Fatal(err)
		}
		requestSeen <- struct {
			auth        string
			model       string
			language    string
			fileContent string
		}{
			auth:        r.Header.Get("Authorization"),
			model:       r.FormValue("model"),
			language:    r.FormValue("language"),
			fileContent: string(data),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "transcribed text"})
	}))
	defer server.Close()

	provider := newOpenAICompatibleTranscriptionProvider(Config{
		TranscriptionBaseURL:  server.URL + "/v1",
		TranscriptionAPIKey:   "test-key",
		TranscriptionModel:    "large-v3",
		TranscriptionLanguage: "zh",
		TranscriptionTimeout:  5 * time.Second,
	})
	result, err := provider.Transcribe(context.Background(), TranscriptionRequest{
		MimeType: "audio/webm",
		FileName: "recording.webm",
		Data:     []byte("audio bytes"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "transcribed text" {
		t.Fatalf("Text = %q", result.Text)
	}
	seen := <-requestSeen
	if seen.auth != "Bearer test-key" {
		t.Fatalf("Authorization = %q", seen.auth)
	}
	if seen.model != "large-v3" || seen.language != "zh" || seen.fileContent != "audio bytes" {
		t.Fatalf("request = %#v", seen)
	}
}

func TestOpenAICompatibleTranscriptionProviderRejectsProviderFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"failed"}`, http.StatusBadGateway)
	}))
	defer server.Close()

	provider := newOpenAICompatibleTranscriptionProvider(Config{
		TranscriptionBaseURL: server.URL,
		TranscriptionModel:   "large-v3",
		TranscriptionTimeout: 5 * time.Second,
	})
	_, err := provider.Transcribe(context.Background(), TranscriptionRequest{
		MimeType: "audio/webm",
		FileName: "recording.webm",
		Data:     []byte("audio bytes"),
	})
	if err == nil || !strings.Contains(err.Error(), "Transcription provider failed") {
		t.Fatalf("error = %v", err)
	}
}

func TestOpenAICompatibleTranscriptionProviderRejectsUnsupportedShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "no text"})
	}))
	defer server.Close()

	provider := newOpenAICompatibleTranscriptionProvider(Config{
		TranscriptionBaseURL: server.URL,
		TranscriptionModel:   "large-v3",
		TranscriptionTimeout: 5 * time.Second,
	})
	_, err := provider.Transcribe(context.Background(), TranscriptionRequest{
		MimeType: "audio/webm",
		FileName: "recording.webm",
		Data:     []byte("audio bytes"),
	})
	if err == nil || !strings.Contains(err.Error(), "unsupported transcription response") {
		t.Fatalf("error = %v", err)
	}
}

func TestSupportedTranscriptionAudioTypes(t *testing.T) {
	for _, mimeType := range []string{"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"} {
		if !supportedTranscriptionAudioType(mimeType) {
			t.Fatalf("%s should be supported", mimeType)
		}
	}
	if supportedTranscriptionAudioType("text/plain") {
		t.Fatal("text/plain should not be supported")
	}
}
