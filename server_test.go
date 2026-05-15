package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
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
