package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestPromptBlocksFromRequestValidatesImages(t *testing.T) {
	blocks, err := promptBlocksFromRequest("hello", []MessageContentBlock{{
		Type:     "image",
		MimeType: "image/png",
		Data:     "iVBORw0KGgo=",
		Name:     stringPtr("image.png"),
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(blocks) != 2 {
		t.Fatalf("blocks = %#v", blocks)
	}

	_, err = promptBlocksFromRequest("", []MessageContentBlock{{
		Type:     "image",
		MimeType: "image/svg+xml",
		Data:     "PHN2Zy8+",
	}})
	if err == nil || !strings.Contains(err.Error(), "Unsupported image type") {
		t.Fatalf("error = %v", err)
	}
}

func TestServerRejectsDisallowedAPIOrigin(t *testing.T) {
	server := newServer(Config{DisableAuth: true, BindHost: "127.0.0.1", BindPort: 7635}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	request := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	request.Host = "127.0.0.1:7635"
	request.Header.Set("Origin", "http://evil.example")

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestServerRequiresCSRFHeaderForBrowserStateChanges(t *testing.T) {
	server := newServer(Config{DisableAuth: true, BindHost: "127.0.0.1", BindPort: 7635}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	request := httptest.NewRequest(http.MethodPost, "/api/workspaces", strings.NewReader(`{"path":"`+strings.ReplaceAll(t.TempDir(), `\`, `\\`)+`"}`))
	request.Host = "127.0.0.1:7635"
	request.Header.Set("Origin", "http://127.0.0.1:7635")

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestServerAllowsSameOriginStateChangeWithCSRFHeader(t *testing.T) {
	server := newServer(Config{DisableAuth: true, BindHost: "127.0.0.1", BindPort: 7635}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	request := httptest.NewRequest(http.MethodPost, "/api/workspaces", strings.NewReader(`{"path":"`+strings.ReplaceAll(t.TempDir(), `\`, `\\`)+`"}`))
	request.Host = "127.0.0.1:7635"
	request.Header.Set("Origin", "http://127.0.0.1:7635")
	request.Header.Set(csrfRequestHeader, csrfRequestHeaderValue)

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestServerAllowsConfiguredFrontendDevOrigin(t *testing.T) {
	server := newServer(Config{DisableAuth: true, BindHost: "127.0.0.1", BindPort: 7635}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	if !server.isAllowedOrigin("http://localhost:5777", "127.0.0.1:7635", "http") {
		t.Fatal("expected loopback frontend dev origin to be allowed")
	}
	if server.isAllowedOrigin("http://127.0.0.1:5778", "127.0.0.1:7635", "http") {
		t.Fatal("expected unexpected loopback port to be rejected")
	}
}

func TestServerAllowsForwardedHTTPSOrigin(t *testing.T) {
	server := newServer(Config{DisableAuth: true, BindHost: "127.0.0.1", BindPort: 7635}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	request := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	request.Host = "127.0.0.1:7635"
	request.Header.Set("Origin", "https://acp-webui.tailnet.test")
	request.Header.Set("X-Forwarded-Host", "acp-webui.tailnet.test")
	request.Header.Set("X-Forwarded-Proto", "https")

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestAppStateIncludesDisplaySafeTranscriptionAvailability(t *testing.T) {
	server := newServer(Config{
		DisableAuth:                true,
		BindHost:                   "127.0.0.1",
		BindPort:                   7635,
		TranscriptionProvider:      "openai-compatible",
		TranscriptionBaseURL:       "http://127.0.0.1:7322/v1",
		TranscriptionAPIKey:        "secret",
		TranscriptionModel:         "large-v3",
		TranscriptionMaxAudioBytes: 25 * 1024 * 1024,
		TranscriptionTimeout:       60 * time.Second,
	}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/app-state", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	body := recorder.Body.String()
	if strings.Contains(body, "secret") || strings.Contains(body, "7322") {
		t.Fatalf("app state leaked provider details: %s", body)
	}
	var data AppData
	if err := json.Unmarshal([]byte(body), &data); err != nil {
		t.Fatal(err)
	}
	if !data.Transcription.Available || data.Transcription.MaxAudioBytes != 25*1024*1024 {
		t.Fatalf("transcription capability = %#v", data.Transcription)
	}
}

func TestHandleAudioTranscriptionCallsConfiguredProvider(t *testing.T) {
	server := newServer(Config{
		DisableAuth:                true,
		TranscriptionProvider:      "openai-compatible",
		TranscriptionBaseURL:       "http://127.0.0.1:7322/v1",
		TranscriptionMaxAudioBytes: 1024,
	}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	fake := &fakeTranscriptionProvider{text: "你好"}
	server.transcriptionProvider = fake

	recorder := httptest.NewRecorder()
	request := multipartAudioRequest(t, "audio/webm", []byte("audio bytes"))
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Text != "你好" {
		t.Fatalf("text = %q", response.Text)
	}
	if fake.request.MimeType != "audio/webm" || string(fake.request.Data) != "audio bytes" {
		t.Fatalf("provider request = %#v", fake.request)
	}
}

func TestHandleAudioTranscriptionRejectsInvalidRequests(t *testing.T) {
	cases := []struct {
		name     string
		config   Config
		request  *http.Request
		wantCode int
		wantBody string
	}{
		{
			name:     "unconfigured",
			config:   Config{DisableAuth: true},
			request:  multipartAudioRequest(t, "audio/webm", []byte("audio bytes")),
			wantCode: http.StatusServiceUnavailable,
			wantBody: "Audio transcription is not configured",
		},
		{
			name:     "unsupported mime",
			config:   Config{DisableAuth: true, TranscriptionProvider: "openai-compatible", TranscriptionBaseURL: "http://127.0.0.1:7322/v1", TranscriptionMaxAudioBytes: 1024},
			request:  multipartAudioRequest(t, "text/plain", []byte("audio bytes")),
			wantCode: http.StatusBadRequest,
			wantBody: "Unsupported audio type",
		},
		{
			name:     "empty audio",
			config:   Config{DisableAuth: true, TranscriptionProvider: "openai-compatible", TranscriptionBaseURL: "http://127.0.0.1:7322/v1", TranscriptionMaxAudioBytes: 1024},
			request:  multipartAudioRequest(t, "audio/webm", nil),
			wantCode: http.StatusBadRequest,
			wantBody: "Audio file is required",
		},
		{
			name:     "too large",
			config:   Config{DisableAuth: true, TranscriptionProvider: "openai-compatible", TranscriptionBaseURL: "http://127.0.0.1:7322/v1", TranscriptionMaxAudioBytes: 3},
			request:  multipartAudioRequest(t, "audio/webm", []byte("audio bytes")),
			wantCode: http.StatusBadRequest,
			wantBody: "Audio files must be 3 bytes or smaller",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := newServer(tc.config, testStorage(t), &AgentRuntimeManager{}, newAuthService(tc.config), newEventHub())
			server.transcriptionProvider = &fakeTranscriptionProvider{text: "unused"}
			recorder := httptest.NewRecorder()
			server.ServeHTTP(recorder, tc.request)
			if recorder.Code != tc.wantCode || !strings.Contains(recorder.Body.String(), tc.wantBody) {
				t.Fatalf("status/body = %d %s, want %d containing %q", recorder.Code, recorder.Body.String(), tc.wantCode, tc.wantBody)
			}
		})
	}
}

func TestHandleAudioTranscriptionReturnsProviderFailure(t *testing.T) {
	config := Config{
		DisableAuth:                true,
		TranscriptionProvider:      "openai-compatible",
		TranscriptionBaseURL:       "http://127.0.0.1:7322/v1",
		TranscriptionMaxAudioBytes: 1024,
	}
	server := newServer(config, testStorage(t), &AgentRuntimeManager{}, newAuthService(config), newEventHub())
	server.transcriptionProvider = &fakeTranscriptionProvider{err: errors.New("provider unavailable")}
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, multipartAudioRequest(t, "audio/webm", []byte("audio bytes")))
	if recorder.Code != http.StatusBadGateway || !strings.Contains(recorder.Body.String(), "provider unavailable") {
		t.Fatalf("status/body = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestWebSocketRejectsDisallowedOrigin(t *testing.T) {
	server := newServer(Config{DisableAuth: true}, testStorage(t), &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	httpServer := httptest.NewServer(server)
	defer httpServer.Close()
	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/api/ws"

	conn, response, err := websocket.DefaultDialer.Dial(wsURL, http.Header{"Origin": []string{"http://evil.example"}})
	if conn != nil {
		_ = conn.Close()
	}
	if err == nil {
		t.Fatal("expected disallowed websocket origin to fail")
	}
	if response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("websocket response = %#v, err = %v", response, err)
	}
}

type fakeTranscriptionProvider struct {
	text    string
	err     error
	request TranscriptionRequest
}

func (f *fakeTranscriptionProvider) Transcribe(ctx context.Context, request TranscriptionRequest) (TranscriptionResult, error) {
	f.request = request
	if f.err != nil {
		return TranscriptionResult{}, f.err
	}
	return TranscriptionResult{Text: f.text}, nil
}

func multipartAudioRequest(t *testing.T, mimeType string, data []byte) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreatePart(map[string][]string{
		"Content-Disposition": {`form-data; name="file"; filename="recording.webm"`},
		"Content-Type":        {mimeType},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/audio/transcriptions", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestPermissionOptionMustBelongToRequest(t *testing.T) {
	storage := testStorage(t)
	ctx := t.Context()
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "acp-session"
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	permission, err := storage.CreatePermissionRequest(ctx, NewPermissionRequest{
		SessionID:    session.ID,
		ACPSessionID: acpSessionID,
		ACPRequestID: "approval-1",
		Title:        "Approve command",
		Kind:         "execute",
		ToolCall:     map[string]any{"toolCallId": "tool-1"},
		Options:      []PermissionOption{{OptionID: "allow", Name: "Allow", Kind: "allow_once"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := newServer(Config{DisableAuth: true}, storage, &AgentRuntimeManager{}, newAuthService(Config{DisableAuth: true}), newEventHub())
	request := httptest.NewRequest(http.MethodPost, "/api/permission-requests/"+permission.ID+"/resolve", strings.NewReader(`{"optionId":"deny"}`))

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	unchanged, err := storage.GetPermissionRequest(ctx, permission.ID)
	if err != nil {
		t.Fatal(err)
	}
	if unchanged.Status != permissionPending || unchanged.SelectedOptionID != nil {
		t.Fatalf("permission mutated after invalid option: %#v", unchanged)
	}
}

func TestHandleWorkspaceAgentSessionsSyncsAndFiltersByWorkspaceAgent(t *testing.T) {
	ctx := t.Context()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	otherWorkspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	if _, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           "other-agent",
		AgentName:         "Other",
		ExternalSessionID: "other-agent-session",
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       otherWorkspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "other-workspace-session",
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
	}); err != nil {
		t.Fatal(err)
	}
	runtime := newReadySessionListRuntime(t, storage, true)
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	defer writer.Close()
	runtime.mu.Lock()
	runtime.stdin = writer
	runtime.mu.Unlock()
	installManagerRuntime(manager, codexAgentID, profile, runtime)
	decoder := json.NewDecoder(reader)
	server := newServer(Config{DisableAuth: true}, storage, manager, newAuthService(Config{DisableAuth: true}), manager.events)

	responseCh := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/agents/"+codexAgentID+"/sessions", nil)
		server.ServeHTTP(recorder, request)
		responseCh <- recorder
	}()

	title := "Native scoped session"
	respondToSessionListRequest(t, decoder, runtime, nativePathString(workspace.Path), nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "native-scoped-session",
			CWD:       nativePathString(workspace.Path),
			Title:     &title,
		}},
	})
	recorder := receiveHTTPResponse(t, responseCh)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	var items []SessionListItem
	if err := json.Unmarshal(recorder.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %#v, want only the synced workspace-agent session", items)
	}
	session := items[0].Session
	if session.WorkspaceID != workspace.ID || session.AgentID != codexAgentID {
		t.Fatalf("session scope = %#v", session)
	}
	if session.ExternalSessionID == nil || *session.ExternalSessionID != "native-scoped-session" {
		t.Fatalf("external session id = %#v", session.ExternalSessionID)
	}
	if session.Title == nil || *session.Title != title {
		t.Fatalf("title = %#v, want %q", session.Title, title)
	}
}

func TestHandleWorkspaceSessionsPreservesLegacyWorkspaceScope(t *testing.T) {
	ctx := t.Context()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	otherWorkspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, _ := testSessionSyncManager(t, storage, "unused-acp")
	server := newServer(Config{DisableAuth: true}, storage, manager, newAuthService(Config{DisableAuth: true}), manager.events)
	profile := testLaunchProfile()

	codexACP := "legacy-codex"
	codexSession, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &codexACP, permissionManual, profile, nil)
	if err != nil {
		t.Fatal(err)
	}
	claudeACP := "legacy-claude"
	claudeSession, err := storage.CreateSession(ctx, workspace.ID, claudeAgentID, "Claude", &claudeACP, permissionManual, profile, nil)
	if err != nil {
		t.Fatal(err)
	}
	otherACP := "other-workspace"
	if _, err := storage.CreateSession(ctx, otherWorkspace.ID, codexAgentID, "Codex", &otherACP, permissionManual, profile, nil); err != nil {
		t.Fatal(err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/sessions", nil)
	server.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	var items []SessionListItem
	if err := json.Unmarshal(recorder.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if got, want := sessionListItemIDs(items), []string{codexSession.ID, claudeSession.ID}; !sameStringSet(got, want) {
		t.Fatalf("legacy workspace items = %v, want %v", got, want)
	}
	for _, item := range items {
		if item.Workspace.ID != workspace.ID || item.Session.WorkspaceID != workspace.ID {
			t.Fatalf("item workspace scope = %#v", item)
		}
	}
}

func TestHandleSessionsPreservesGlobalScope(t *testing.T) {
	ctx := t.Context()
	storage := testStorage(t)
	firstWorkspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	secondWorkspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, _ := testSessionSyncManager(t, storage, "unused-acp")
	server := newServer(Config{DisableAuth: true}, storage, manager, newAuthService(Config{DisableAuth: true}), manager.events)
	profile := testLaunchProfile()

	firstACP := "global-first"
	firstSession, err := storage.CreateSession(ctx, firstWorkspace.ID, codexAgentID, "Codex", &firstACP, permissionManual, profile, nil)
	if err != nil {
		t.Fatal(err)
	}
	secondACP := "global-second"
	secondSession, err := storage.CreateSession(ctx, secondWorkspace.ID, claudeAgentID, "Claude", &secondACP, permissionManual, profile, nil)
	if err != nil {
		t.Fatal(err)
	}

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/sessions", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	var items []SessionListItem
	if err := json.Unmarshal(recorder.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if got, want := sessionListItemIDs(items), []string{firstSession.ID, secondSession.ID}; !sameStringSet(got, want) {
		t.Fatalf("global items = %v, want %v", got, want)
	}
}

func TestHandleCreateSessionResponseIncludesWorkspaceAgentRouteContext(t *testing.T) {
	ctx := t.Context()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	runtime := newReadySessionListRuntime(t, storage, false)
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	defer writer.Close()
	runtime.mu.Lock()
	runtime.stdin = writer
	runtime.mu.Unlock()
	installManagerRuntime(manager, codexAgentID, profile, runtime)
	decoder := json.NewDecoder(reader)
	server := newServer(Config{DisableAuth: true}, storage, manager, newAuthService(Config{DisableAuth: true}), manager.events)

	responseCh := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		body := bytes.NewBufferString(`{"agentId":"codex","permissionMode":"manual"}`)
		request := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+workspace.ID+"/sessions", body)
		server.ServeHTTP(recorder, request)
		responseCh <- recorder
	}()

	respondToNewSessionRequest(t, decoder, runtime, nativePathString(workspace.Path), "created-agent-session")
	recorder := receiveHTTPResponse(t, responseCh)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	var detail SessionDetail
	if err := json.Unmarshal(recorder.Body.Bytes(), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.Workspace.ID != workspace.ID {
		t.Fatalf("workspace id = %q, want %q", detail.Workspace.ID, workspace.ID)
	}
	if detail.Session.WorkspaceID != workspace.ID || detail.Session.AgentID != codexAgentID {
		t.Fatalf("session route context = %#v", detail.Session)
	}
	if detail.Session.ExternalSessionID == nil || *detail.Session.ExternalSessionID != "created-agent-session" {
		t.Fatalf("external session id = %#v", detail.Session.ExternalSessionID)
	}
}

func TestHandleCreateSessionPublishesScopedListChangedEvent(t *testing.T) {
	ctx := t.Context()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	events := manager.events.Subscribe()
	defer manager.events.Unsubscribe(events)
	runtime := newReadySessionListRuntime(t, storage, false)
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	defer writer.Close()
	runtime.mu.Lock()
	runtime.stdin = writer
	runtime.mu.Unlock()
	installManagerRuntime(manager, codexAgentID, profile, runtime)
	decoder := json.NewDecoder(reader)
	server := newServer(Config{DisableAuth: true}, storage, manager, newAuthService(Config{DisableAuth: true}), manager.events)

	responseCh := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		body := bytes.NewBufferString(`{"agentId":"codex","permissionMode":"manual"}`)
		request := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+workspace.ID+"/sessions", body)
		server.ServeHTTP(recorder, request)
		responseCh <- recorder
	}()

	respondToNewSessionRequest(t, decoder, runtime, nativePathString(workspace.Path), "created-event-session")
	recorder := receiveHTTPResponse(t, responseCh)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	event := receiveSessionListChangedEvent(t, events)
	if event["workspaceId"] != workspace.ID {
		t.Fatalf("workspaceId = %#v, want %q", event["workspaceId"], workspace.ID)
	}
	if event["agentId"] != codexAgentID {
		t.Fatalf("agentId = %#v, want %q", event["agentId"], codexAgentID)
	}
	if event["count"] != 1 {
		t.Fatalf("count = %#v, want 1", event["count"])
	}
}

func TestImportedNativeSessionListAndDetailIncludeRouteContext(t *testing.T) {
	ctx := t.Context()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	runtime := newReadySessionListRuntime(t, storage, true)
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	defer writer.Close()
	runtime.mu.Lock()
	runtime.stdin = writer
	runtime.mu.Unlock()
	installManagerRuntime(manager, codexAgentID, profile, runtime)
	decoder := json.NewDecoder(reader)
	server := newServer(Config{DisableAuth: true}, storage, manager, newAuthService(Config{DisableAuth: true}), manager.events)

	responseCh := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/agents/"+codexAgentID+"/sessions", nil)
		server.ServeHTTP(recorder, request)
		responseCh <- recorder
	}()

	respondToSessionListRequest(t, decoder, runtime, nativePathString(workspace.Path), nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "native-route-context",
			CWD:       nativePathString(workspace.Path),
		}},
	})
	listRecorder := receiveHTTPResponse(t, responseCh)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("list status = %d body = %s", listRecorder.Code, listRecorder.Body.String())
	}
	var items []SessionListItem
	if err := json.Unmarshal(listRecorder.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %#v, want one imported session", items)
	}
	item := items[0]
	if item.Workspace.ID != workspace.ID {
		t.Fatalf("list workspace id = %q, want %q", item.Workspace.ID, workspace.ID)
	}
	if item.Session.WorkspaceID != workspace.ID || item.Session.AgentID != codexAgentID {
		t.Fatalf("list session route context = %#v", item.Session)
	}
	if item.Session.ExternalSessionID == nil || *item.Session.ExternalSessionID != "native-route-context" {
		t.Fatalf("list external session id = %#v", item.Session.ExternalSessionID)
	}

	detailRecorder := httptest.NewRecorder()
	server.ServeHTTP(detailRecorder, httptest.NewRequest(http.MethodGet, "/api/sessions/"+item.Session.ID, nil))
	if detailRecorder.Code != http.StatusOK {
		t.Fatalf("detail status = %d body = %s", detailRecorder.Code, detailRecorder.Body.String())
	}
	var detail SessionDetail
	if err := json.Unmarshal(detailRecorder.Body.Bytes(), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.Workspace.ID != workspace.ID {
		t.Fatalf("detail workspace id = %q, want %q", detail.Workspace.ID, workspace.ID)
	}
	if detail.Session.WorkspaceID != workspace.ID || detail.Session.AgentID != codexAgentID {
		t.Fatalf("detail session route context = %#v", detail.Session)
	}
	if detail.Session.ExternalSessionID == nil || *detail.Session.ExternalSessionID != "native-route-context" {
		t.Fatalf("detail external session id = %#v", detail.Session.ExternalSessionID)
	}
}

func TestHandleWorkspaceAgentSessionsRejectsUnknownWorkspaceAndAgent(t *testing.T) {
	ctx := t.Context()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, _ := testSessionSyncManager(t, storage, "unused-acp")
	server := newServer(Config{DisableAuth: true}, storage, manager, newAuthService(Config{DisableAuth: true}), manager.events)

	unknownWorkspace := httptest.NewRecorder()
	server.ServeHTTP(unknownWorkspace, httptest.NewRequest(http.MethodGet, "/api/workspaces/missing/agents/"+codexAgentID+"/sessions", nil))
	if unknownWorkspace.Code != http.StatusNotFound {
		t.Fatalf("unknown workspace status = %d body = %s", unknownWorkspace.Code, unknownWorkspace.Body.String())
	}

	unknownAgent := httptest.NewRecorder()
	server.ServeHTTP(unknownAgent, httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/agents/missing/sessions", nil))
	if unknownAgent.Code != http.StatusBadRequest {
		t.Fatalf("unknown agent status = %d body = %s", unknownAgent.Code, unknownAgent.Body.String())
	}
}

type newSessionRequest struct {
	ID     int64  `json:"id"`
	Method string `json:"method"`
	Params struct {
		CWD string `json:"cwd"`
	} `json:"params"`
}

func respondToNewSessionRequest(t *testing.T, decoder *json.Decoder, runtime *AgentRuntime, wantCWD string, sessionID string) {
	t.Helper()
	requestCh := make(chan struct {
		request newSessionRequest
		err     error
	}, 1)
	go func() {
		var request newSessionRequest
		err := decoder.Decode(&request)
		requestCh <- struct {
			request newSessionRequest
			err     error
		}{request: request, err: err}
	}()
	var request newSessionRequest
	select {
	case result := <-requestCh:
		if result.err != nil {
			t.Fatal(result.err)
		}
		request = result.request
	case <-time.After(sessionListTestTimeout):
		t.Fatal("timed out waiting for session/new request")
	}
	if request.Method != "session/new" {
		t.Fatalf("method = %q, want session/new", request.Method)
	}
	if request.Params.CWD != wantCWD {
		t.Fatalf("cwd = %q, want %q", request.Params.CWD, wantCWD)
	}
	data, err := json.Marshal(map[string]any{"sessionId": sessionID})
	if err != nil {
		t.Fatal(err)
	}
	key := strconv.FormatInt(request.ID, 10)
	runtime.mu.Lock()
	ch := runtime.pending[key]
	delete(runtime.pending, key)
	runtime.mu.Unlock()
	if ch == nil {
		t.Fatalf("pending request %s not found", key)
	}
	ch <- rpcResponse{Result: data}
}

func receiveHTTPResponse(t *testing.T, ch <-chan *httptest.ResponseRecorder) *httptest.ResponseRecorder {
	t.Helper()
	select {
	case recorder := <-ch:
		return recorder
	case <-time.After(sessionListTestTimeout):
		t.Fatal("timed out waiting for HTTP response")
	}
	return nil
}
