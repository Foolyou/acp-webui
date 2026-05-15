package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

func TestAgentRuntimeFlushesAssistantChunksBeforeToolCalls(t *testing.T) {
	ctx := context.Background()
	storage, session := testRuntimeSession(t)
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	runtime.RegisterSession("acp-session", session.ID)
	runtime.beginAssistantBuffer("acp-session")

	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "agent_message_chunk",
		"content":       map[string]any{"type": "text", "text": "Before tool."},
	}))
	messages, err := storage.ListMessages(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Status != statusRunning {
		t.Fatalf("live assistant messages = %#v", messages)
	}
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "tool_call",
		"toolCallId":    "tool-1",
		"title":         "Run tests",
		"kind":          "execute",
		"status":        "running",
	}))
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "agent_message_chunk",
		"content":       map[string]any{"type": "text", "text": "After tool."},
	}))
	runtime.flushAssistantBuffer(ctx, "acp-session", session.ID, true, false, true)

	detail, err := storage.SessionDetail(ctx, session.ID, liveContinuity())
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Timeline) != 3 {
		t.Fatalf("timeline = %#v", detail.Timeline)
	}
	assertTimelineItem(t, detail.Timeline[0], "message", "Before tool.")
	assertTimelineItem(t, detail.Timeline[1], "tool_call", "Run tests")
	assertTimelineItem(t, detail.Timeline[2], "message", "After tool.")
}

func TestAgentRuntimeReplaysEmptyRestoreHistoryInOrder(t *testing.T) {
	ctx := context.Background()
	storage, session := testRuntimeSession(t)
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	runtime.mu.Lock()
	runtime.restoreMap["acp-session"] = RestoreContext{LocalSessionID: session.ID, PersistReplayedHistory: true}
	runtime.mu.Unlock()

	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "user_message_chunk",
		"content":       map[string]any{"type": "text", "text": "First prompt"},
	}))
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "agent_message_chunk",
		"content":       map[string]any{"type": "text", "text": "First answer"},
	}))
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "tool_call_update",
		"toolCallId":    "tool-1",
		"title":         "Replay tool output",
		"kind":          "execute",
		"status":        "completed",
		"content":       []any{map[string]any{"type": "text", "text": "tool output"}},
	}))
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "agent_message_chunk",
		"content":       map[string]any{"type": "text", "text": "Second answer"},
	}))
	runtime.flushAssistantBuffer(ctx, "acp-session", session.ID, true, true, false)

	detail, err := storage.SessionDetail(ctx, session.ID, liveContinuity())
	if err != nil {
		t.Fatal(err)
	}
	gotMessages := make([]string, 0, len(detail.Messages))
	for _, message := range detail.Messages {
		gotMessages = append(gotMessages, message.Role+":"+message.Content)
	}
	wantMessages := []string{"user:First prompt", "assistant:First answer", "assistant:Second answer"}
	if strings.Join(gotMessages, "|") != strings.Join(wantMessages, "|") {
		t.Fatalf("messages = %#v, want %#v", gotMessages, wantMessages)
	}
	if len(detail.Timeline) != 5 {
		t.Fatalf("timeline = %#v", detail.Timeline)
	}
	assertTimelineItem(t, detail.Timeline[0], "message", "First prompt")
	assertTimelineItem(t, detail.Timeline[1], "message", "First answer")
	assertTimelineItem(t, detail.Timeline[2], "tool_call", "Replay tool output")
	assertTimelineItem(t, detail.Timeline[3], "review_artifact", "Replay tool output")
	assertTimelineItem(t, detail.Timeline[4], "message", "Second answer")
	if len(detail.ReviewArtifacts) != 1 || detail.ReviewArtifacts[0].Source != "acp" {
		t.Fatalf("review artifacts = %#v", detail.ReviewArtifacts)
	}
}

func TestAgentRuntimeSkipsRestoreReplayWhenAssistantHistoryExists(t *testing.T) {
	ctx := context.Background()
	storage, session := testRuntimeSession(t)
	if _, err := storage.CreateMessage(ctx, session.ID, roleAssistant, "Existing answer", []MessageContentBlock{textBlock("Existing answer")}, statusIdle); err != nil {
		t.Fatal(err)
	}
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	runtime.mu.Lock()
	runtime.restoreMap["acp-session"] = RestoreContext{LocalSessionID: session.ID, PersistReplayedHistory: false}
	runtime.mu.Unlock()

	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "agent_message_chunk",
		"content":       map[string]any{"type": "text", "text": "Duplicate answer"},
	}))
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "tool_call_update",
		"toolCallId":    "tool-1",
		"title":         "Duplicate tool",
		"kind":          "execute",
		"status":        "completed",
		"content":       []any{map[string]any{"type": "text", "text": "tool output"}},
	}))

	detail, err := storage.SessionDetail(ctx, session.ID, liveContinuity())
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Messages) != 1 || detail.Messages[0].Content != "Existing answer" {
		t.Fatalf("messages = %#v", detail.Messages)
	}
	calls, err := storage.ListToolCalls(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(calls) != 0 {
		t.Fatalf("tool calls = %#v", calls)
	}
}

func TestAgentRuntimeNormalizesToolCallUpdates(t *testing.T) {
	ctx := context.Background()
	storage, session := testRuntimeSession(t)
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	runtime.RegisterSession("acp-session", session.ID)

	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "tool_call_update",
		"id":            "tool-1",
		"name":          "Run tests",
		"type":          "command",
	}))
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "tool_call_update",
		"id":            "tool-1",
		"name":          "Run tests",
		"type":          "command",
		"status":        "success",
		"output":        map[string]any{"text": "ok"},
	}))

	calls, err := storage.ListToolCalls(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(calls) != 1 {
		t.Fatalf("tool calls = %#v", calls)
	}
	if calls[0].Status != "completed" || calls[0].Kind != "command" || calls[0].Title != "Run tests" {
		t.Fatalf("tool call = %#v", calls[0])
	}
	artifacts, err := storage.ListReviewArtifactSummaries(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(artifacts) != 1 || artifacts[0].Kind != "terminal" || artifacts[0].Source != "acp" {
		t.Fatalf("artifacts = %#v", artifacts)
	}
}

func TestAgentRuntimePermissionResponsesPreserveJSONRPCIDType(t *testing.T) {
	storage, _ := testRuntimeSession(t)
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	runtime.stdin = writer

	runtime.handlePermissionRequest(json.RawMessage(`7`), sessionUpdate(t, "missing-acp-session", map[string]any{}))
	_ = writer.Close()

	var response map[string]any
	if err := json.NewDecoder(reader).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if _, ok := response["id"].(float64); !ok {
		t.Fatalf("response id = %#v, want numeric JSON id", response["id"])
	}
}

func TestParseAgentSessionCapabilitiesTreatsExplicitListFalseAsUnsupported(t *testing.T) {
	tests := []struct {
		name string
		json string
		want bool
	}{
		{name: "missing", json: `{}`, want: false},
		{name: "false", json: `{"list": false}`, want: false},
		{name: "true", json: `{"list": true}`, want: true},
		{name: "object", json: `{"list": {"pagination": true}}`, want: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var caps initializeSessionCapabilities
			if err := json.Unmarshal([]byte(tt.json), &caps); err != nil {
				t.Fatal(err)
			}
			got := parseAgentSessionCapabilities(false, caps).ListSessions
			if got != tt.want {
				t.Fatalf("ListSessions = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAgentRuntimeListSessionsRequestsAllPages(t *testing.T) {
	ctx := context.Background()
	storage, _ := testRuntimeSession(t)
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
	decoder := json.NewDecoder(reader)

	type listResult struct {
		sessions []ACPSessionListItem
		err      error
	}
	resultCh := make(chan listResult, 1)
	go func() {
		sessions, err := runtime.ListSessions(ctx, "C:\\workspace")
		resultCh <- listResult{sessions: sessions, err: err}
	}()

	cursor := "page-2"
	firstTitle := "First session"
	respondToSessionListRequest(t, decoder, runtime, "C:\\workspace", nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{
			{SessionID: "external-1", CWD: "C:\\workspace", Title: &firstTitle},
		},
		NextCursor: &cursor,
	})
	respondToSessionListRequest(t, decoder, runtime, "C:\\workspace", &cursor, ACPSessionListResult{
		Sessions: []ACPSessionListItem{
			{SessionID: "external-2", CWD: "C:\\workspace"},
		},
	})

	result := <-resultCh
	if result.err != nil {
		t.Fatal(result.err)
	}
	if len(result.sessions) != 2 {
		t.Fatalf("sessions = %#v, want 2 items", result.sessions)
	}
	if result.sessions[0].SessionID != "external-1" || result.sessions[1].SessionID != "external-2" {
		t.Fatalf("sessions = %#v", result.sessions)
	}
}

func TestAgentRuntimeListSessionsReturnsEmptySliceForNilACPResult(t *testing.T) {
	ctx := context.Background()
	storage, _ := testRuntimeSession(t)
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
	decoder := json.NewDecoder(reader)

	type listResult struct {
		sessions []ACPSessionListItem
		err      error
	}
	resultCh := make(chan listResult, 1)
	go func() {
		sessions, err := runtime.ListSessions(ctx, "/workspace")
		resultCh <- listResult{sessions: sessions, err: err}
	}()

	respondToSessionListRequest(t, decoder, runtime, "/workspace", nil, ACPSessionListResult{})

	result := <-resultCh
	if result.err != nil {
		t.Fatal(result.err)
	}
	if result.sessions == nil {
		t.Fatal("sessions is nil, want empty slice")
	}
	if len(result.sessions) != 0 {
		t.Fatalf("sessions = %#v, want empty", result.sessions)
	}
}

func TestAgentRuntimeListSessionsDoesNotRequestWhenUnsupported(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	storage, _ := testRuntimeSession(t)
	runtime := newReadySessionListRuntime(t, storage, false)
	writer := &countingWriteCloser{}
	runtime.mu.Lock()
	runtime.stdin = writer
	runtime.mu.Unlock()

	sessions, err := runtime.ListSessions(ctx, "/workspace")
	if err == nil {
		t.Fatal("ListSessions error = nil, want unsupported capability error")
	}
	if !strings.Contains(err.Error(), "does not support session/list") {
		t.Fatalf("ListSessions error = %q, want unsupported capability error", err.Error())
	}
	if sessions != nil {
		t.Fatalf("sessions = %#v, want nil on error", sessions)
	}
	if writer.writes != 0 {
		t.Fatalf("request writes = %d, want 0", writer.writes)
	}
}

func TestACPSessionListWireModels(t *testing.T) {
	paramsCursor := "cursor-1"
	paramsData, err := json.Marshal(ACPSessionListParams{CWD: "/workspace", Cursor: &paramsCursor})
	if err != nil {
		t.Fatal(err)
	}
	if got, want := string(paramsData), `{"cwd":"/workspace","cursor":"cursor-1"}`; got != want {
		t.Fatalf("params JSON = %s, want %s", got, want)
	}

	var result ACPSessionListResult
	if err := json.Unmarshal([]byte(`{"sessions":[{"sessionId":"external-1","cwd":"/workspace","title":"Native title","updatedAt":"2026-05-15T01:02:03Z","_meta":{"source":"codex"}}],"nextCursor":"cursor-2"}`), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Sessions) != 1 {
		t.Fatalf("sessions = %#v, want 1 item", result.Sessions)
	}
	item := result.Sessions[0]
	if item.SessionID != "external-1" || item.CWD != "/workspace" {
		t.Fatalf("session item = %#v", item)
	}
	if item.Title == nil || *item.Title != "Native title" {
		t.Fatalf("title = %#v", item.Title)
	}
	if item.UpdatedAt == nil || *item.UpdatedAt != "2026-05-15T01:02:03Z" {
		t.Fatalf("updatedAt = %#v", item.UpdatedAt)
	}
	if result.NextCursor == nil || *result.NextCursor != "cursor-2" {
		t.Fatalf("nextCursor = %#v", result.NextCursor)
	}
	if item.Meta["source"] != "codex" {
		t.Fatalf("meta = %#v", item.Meta)
	}
}

func newReadySessionListRuntime(t *testing.T, storage *Storage, listSupported bool) *AgentRuntime {
	t.Helper()
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex", Enabled: true}, permissionManual, storage, newEventHub())
	caps := AgentSessionCapabilities{ListSessions: listSupported}
	runtime.mu.Lock()
	runtime.statusValue = readyStatus(nil, AgentPromptCapabilities{}, caps)
	runtime.sessionCaps = caps
	runtime.mu.Unlock()
	return runtime
}

func respondToSessionListRequest(t *testing.T, decoder *json.Decoder, runtime *AgentRuntime, wantCWD string, wantCursor *string, result ACPSessionListResult) {
	t.Helper()
	var request struct {
		ID     int64                `json:"id"`
		Method string               `json:"method"`
		Params ACPSessionListParams `json:"params"`
	}
	if err := decoder.Decode(&request); err != nil {
		t.Fatal(err)
	}
	if request.Method != "session/list" {
		t.Fatalf("method = %q, want session/list", request.Method)
	}
	if request.Params.CWD != wantCWD {
		t.Fatalf("cwd = %q, want %q", request.Params.CWD, wantCWD)
	}
	if (request.Params.Cursor == nil) != (wantCursor == nil) {
		t.Fatalf("cursor = %#v, want %#v", request.Params.Cursor, wantCursor)
	}
	if wantCursor != nil && *request.Params.Cursor != *wantCursor {
		t.Fatalf("cursor = %q, want %q", *request.Params.Cursor, *wantCursor)
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	key := fmt.Sprintf("%d", request.ID)
	runtime.mu.Lock()
	ch := runtime.pending[key]
	delete(runtime.pending, key)
	runtime.mu.Unlock()
	if ch == nil {
		t.Fatalf("pending request %s not found", key)
	}
	ch <- rpcResponse{Result: data}
}

type countingWriteCloser struct {
	writes int
}

func (w *countingWriteCloser) Write(p []byte) (int, error) {
	w.writes++
	return len(p), nil
}

func (w *countingWriteCloser) Close() error {
	return nil
}

func testRuntimeSession(t *testing.T) (*Storage, Session) {
	t.Helper()
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "acp-session"
	profile := ResolvedAgentLaunchProfile{ID: permissionManual, Key: "permission=manual", PermissionMode: permissionManual}
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, profile, nil)
	if err != nil {
		t.Fatal(err)
	}
	return storage, session
}

func sessionUpdate(t *testing.T, sessionID string, update map[string]any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(map[string]any{
		"sessionId": sessionID,
		"update":    update,
	})
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func assertTimelineItem(t *testing.T, item TimelineItem, kind string, text string) {
	t.Helper()
	if item["kind"] != kind {
		t.Fatalf("timeline item kind = %v, want %s: %#v", item["kind"], kind, item)
	}
	switch kind {
	case "message":
		if item["content"] != text {
			t.Fatalf("message content = %v, want %q: %#v", item["content"], text, item)
		}
	case "tool_call":
		if item["title"] != text {
			t.Fatalf("tool title = %v, want %q: %#v", item["title"], text, item)
		}
	case "review_artifact":
		if item["title"] != text {
			t.Fatalf("artifact title = %v, want %q: %#v", item["title"], text, item)
		}
	}
}
