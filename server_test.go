package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
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
