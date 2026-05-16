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

	resultCh := make(chan sessionListCallResult, 1)
	go func() {
		sessions, err := runtime.ListSessions(ctx, "C:\\workspace")
		resultCh <- sessionListCallResult{sessions: sessions, err: err}
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

	result := receiveSessionListResult(t, resultCh)
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

	resultCh := make(chan sessionListCallResult, 1)
	go func() {
		sessions, err := runtime.ListSessions(ctx, "/workspace")
		resultCh <- sessionListCallResult{sessions: sessions, err: err}
	}()

	respondToSessionListRequest(t, decoder, runtime, "/workspace", nil, ACPSessionListResult{})

	result := receiveSessionListResult(t, resultCh)
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
	ctx := context.Background()
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

func TestAgentRuntimeListSessionsDetectsCursorLoop(t *testing.T) {
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

	resultCh := make(chan sessionListCallResult, 1)
	go func() {
		sessions, err := runtime.ListSessions(ctx, "/workspace")
		resultCh <- sessionListCallResult{sessions: sessions, err: err}
	}()

	cursor := "repeat"
	respondToSessionListRequest(t, decoder, runtime, "/workspace", nil, ACPSessionListResult{NextCursor: &cursor})
	respondToSessionListRequest(t, decoder, runtime, "/workspace", &cursor, ACPSessionListResult{NextCursor: &cursor})

	result := receiveSessionListResult(t, resultCh)
	if result.err == nil {
		t.Fatal("ListSessions error = nil, want cursor loop error")
	}
	if !strings.Contains(result.err.Error(), "cursor loop") {
		t.Fatalf("ListSessions error = %q, want cursor loop error", result.err.Error())
	}
}

func TestAgentRuntimeListSessionsStopsAfterMaxPages(t *testing.T) {
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

	resultCh := make(chan sessionListCallResult, 1)
	go func() {
		sessions, err := runtime.ListSessions(ctx, "/workspace")
		resultCh <- sessionListCallResult{sessions: sessions, err: err}
	}()

	var wantCursor *string
	for page := 1; page <= maxACPSessionListPages; page++ {
		nextCursor := fmt.Sprintf("page-%d", page)
		respondToSessionListRequest(t, decoder, runtime, "/workspace", wantCursor, ACPSessionListResult{NextCursor: &nextCursor})
		wantCursor = &nextCursor
	}

	result := receiveSessionListResult(t, resultCh)
	if result.err == nil {
		t.Fatal("ListSessions error = nil, want max-page error")
	}
	if !strings.Contains(result.err.Error(), fmt.Sprintf("exceeded %d pages", maxACPSessionListPages)) {
		t.Fatalf("ListSessions error = %q, want max-page error", result.err.Error())
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsImportsNativeList(t *testing.T) {
	ctx := context.Background()
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

	resultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		resultCh <- managerSyncResult{items: items, err: err}
	}()

	nativeCWD := nativePathString(workspace.Path)
	title := "Native session"
	updatedAt := "2026-05-15T01:02:03Z"
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "external-1",
			CWD:       nativeCWD,
			Title:     &title,
			UpdatedAt: &updatedAt,
		}},
	})

	result := receiveManagerSyncResult(t, resultCh)
	if result.err != nil {
		t.Fatal(result.err)
	}
	if len(result.items) != 1 {
		t.Fatalf("items = %#v, want 1 item", result.items)
	}
	session := result.items[0].Session
	if session.AgentID != codexAgentID || session.WorkspaceID != workspace.ID {
		t.Fatalf("session scope = %#v", session)
	}
	if session.ExternalSessionID == nil || *session.ExternalSessionID != "external-1" {
		t.Fatalf("external session id = %#v", session.ExternalSessionID)
	}
	if session.Title == nil || *session.Title != title {
		t.Fatalf("title = %#v, want %q", session.Title, title)
	}
	if session.NativeTitle == nil || *session.NativeTitle != title {
		t.Fatalf("native title = %#v, want %q", session.NativeTitle, title)
	}
	if session.NativeUpdatedAt == nil || *session.NativeUpdatedAt != updatedAt {
		t.Fatalf("native updated at = %#v, want %q", session.NativeUpdatedAt, updatedAt)
	}
	if session.ImportSource != importSourceACPSessionList {
		t.Fatalf("import source = %q", session.ImportSource)
	}
	if session.PermissionMode != permissionManual || session.LaunchProfileKey != profile.Key {
		t.Fatalf("launch metadata = %#v, profile = %#v", session, profile)
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsPublishesScopedListChangedEventOnlyOnMaterialImportChange(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	events := manager.events.Subscribe()
	defer manager.events.Unsubscribe(events)
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

	nativeCWD := nativePathString(workspace.Path)
	title := "Native session"
	updatedAt := "2026-05-15T01:02:03Z"
	resultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		resultCh <- managerSyncResult{items: items, err: err}
	}()
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "event-external-1",
			CWD:       nativeCWD,
			Title:     &title,
			UpdatedAt: &updatedAt,
		}},
	})

	result := receiveManagerSyncResult(t, resultCh)
	if result.err != nil {
		t.Fatal(result.err)
	}
	if len(result.items) != 1 {
		t.Fatalf("items = %#v, want 1 item", result.items)
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

	secondResultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		secondResultCh <- managerSyncResult{items: items, err: err}
	}()
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "event-external-1",
			CWD:       nativeCWD,
			Title:     &title,
			UpdatedAt: &updatedAt,
		}},
	})
	secondResult := receiveManagerSyncResult(t, secondResultCh)
	if secondResult.err != nil {
		t.Fatal(secondResult.err)
	}
	if len(secondResult.items) != 1 {
		t.Fatalf("second sync items = %#v, want 1 item", secondResult.items)
	}
	assertNoSessionListChangedEvent(t, events)

	renamedTitle := "Renamed native session"
	renamedUpdatedAt := "2026-05-15T02:03:04Z"
	thirdResultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		thirdResultCh <- managerSyncResult{items: items, err: err}
	}()
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "event-external-1",
			CWD:       nativeCWD,
			Title:     &renamedTitle,
			UpdatedAt: &renamedUpdatedAt,
		}},
	})
	thirdResult := receiveManagerSyncResult(t, thirdResultCh)
	if thirdResult.err != nil {
		t.Fatal(thirdResult.err)
	}
	if len(thirdResult.items) != 1 {
		t.Fatalf("third sync items = %#v, want 1 item", thirdResult.items)
	}
	event = receiveSessionListChangedEvent(t, events)
	if event["count"] != 1 {
		t.Fatalf("changed count = %#v, want 1", event["count"])
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsPagesAndReimportsIdempotently(t *testing.T) {
	ctx := context.Background()
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

	firstResultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		firstResultCh <- managerSyncResult{items: items, err: err}
	}()

	nativeCWD := nativePathString(workspace.Path)
	firstCursor := "second-page"
	firstTitle := "First title"
	firstUpdatedAt := "2026-05-15T01:02:03Z"
	secondTitle := "Second title"
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "external-1",
			CWD:       nativeCWD,
			Title:     &firstTitle,
			UpdatedAt: &firstUpdatedAt,
		}},
		NextCursor: &firstCursor,
	})
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, &firstCursor, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "external-2",
			CWD:       nativeCWD,
			Title:     &secondTitle,
		}},
	})

	firstResult := receiveManagerSyncResult(t, firstResultCh)
	if firstResult.err != nil {
		t.Fatal(firstResult.err)
	}
	if len(firstResult.items) != 2 {
		t.Fatalf("first sync items = %#v, want 2", firstResult.items)
	}
	firstIDs := map[string]string{}
	for _, item := range firstResult.items {
		if item.Session.ExternalSessionID == nil {
			t.Fatalf("first sync session missing external id: %#v", item.Session)
		}
		firstIDs[*item.Session.ExternalSessionID] = item.Session.ID
	}
	if firstIDs["external-1"] == "" || firstIDs["external-2"] == "" {
		t.Fatalf("first sync ids = %#v, want both external sessions", firstIDs)
	}

	secondResultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		secondResultCh <- managerSyncResult{items: items, err: err}
	}()

	updatedTitle := "Updated first title"
	updatedAt := "2026-05-15T02:03:04Z"
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "external-1",
			CWD:       nativeCWD,
			Title:     &updatedTitle,
			UpdatedAt: &updatedAt,
		}, {
			SessionID: "external-2",
			CWD:       nativeCWD,
			Title:     &secondTitle,
		}},
	})

	secondResult := receiveManagerSyncResult(t, secondResultCh)
	if secondResult.err != nil {
		t.Fatal(secondResult.err)
	}
	if len(secondResult.items) != 2 {
		t.Fatalf("second sync items = %#v, want 2 without duplicates", secondResult.items)
	}
	for _, item := range secondResult.items {
		if item.Session.ExternalSessionID == nil {
			t.Fatalf("second sync session missing external id: %#v", item.Session)
		}
		externalID := *item.Session.ExternalSessionID
		if item.Session.ID != firstIDs[externalID] {
			t.Fatalf("session %s id = %s, want original %s", externalID, item.Session.ID, firstIDs[externalID])
		}
		if externalID == "external-1" {
			if item.Session.Title == nil || *item.Session.Title != updatedTitle {
				t.Fatalf("updated title = %#v, want %q", item.Session.Title, updatedTitle)
			}
			if item.Session.NativeUpdatedAt == nil || *item.Session.NativeUpdatedAt != updatedAt {
				t.Fatalf("updated native timestamp = %#v, want %q", item.Session.NativeUpdatedAt, updatedAt)
			}
		}
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsCanonicalizesPartialProfile(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, _ := testSessionSyncManager(t, storage, "unused-acp")
	canonicalProfile, err := manager.configs[codexAgentID].resolveLaunchProfile(permissionFullAuto, nil)
	if err != nil {
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
	installManagerRuntime(manager, codexAgentID, canonicalProfile, runtime)
	decoder := json.NewDecoder(reader)

	resultCh := make(chan managerSyncResult, 1)
	go func() {
		partialProfile := ResolvedAgentLaunchProfile{Key: canonicalProfile.Key}
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, partialProfile)
		resultCh <- managerSyncResult{items: items, err: err}
	}()

	nativeCWD := nativePathString(workspace.Path)
	respondToSessionListRequest(t, decoder, runtime, nativeCWD, nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "external-full-auto",
			CWD:       nativeCWD,
		}},
	})

	result := receiveManagerSyncResult(t, resultCh)
	if result.err != nil {
		t.Fatal(result.err)
	}
	if len(result.items) != 1 {
		t.Fatalf("items = %#v, want 1 item", result.items)
	}
	session := result.items[0].Session
	if session.PermissionMode != canonicalProfile.PermissionMode {
		t.Fatalf("permission mode = %q, want %q", session.PermissionMode, canonicalProfile.PermissionMode)
	}
	if session.LaunchProfileID != canonicalProfile.ID || session.LaunchProfileKey != canonicalProfile.Key {
		t.Fatalf("launch profile = id %q key %q, want id %q key %q", session.LaunchProfileID, session.LaunchProfileKey, canonicalProfile.ID, canonicalProfile.Key)
	}
	if len(result.items[0].LaunchControlSummary) != len(canonicalProfile.Summary) {
		t.Fatalf("launch summary = %#v, want configured summary %#v", result.items[0].LaunchControlSummary, canonicalProfile.Summary)
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsSkipsListChangedEventWithoutRelevantImport(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	events := manager.events.Subscribe()
	defer manager.events.Unsubscribe(events)
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

	resultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		resultCh <- managerSyncResult{items: items, err: err}
	}()
	respondToSessionListRequest(t, decoder, runtime, nativePathString(workspace.Path), nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "other-cwd-session",
			CWD:       nativePathString(t.TempDir()),
		}},
	})
	result := receiveManagerSyncResult(t, resultCh)
	if result.err != nil {
		t.Fatal(result.err)
	}
	if len(result.items) != 0 {
		t.Fatalf("items = %#v, want no imported sessions", result.items)
	}
	assertNoSessionListChangedEvent(t, events)

	unsupportedManager, unsupportedProfile := testSessionSyncManager(t, storage, "unused-acp")
	unsupportedEvents := unsupportedManager.events.Subscribe()
	defer unsupportedManager.events.Unsubscribe(unsupportedEvents)
	unsupportedRuntime := newReadySessionListRuntime(t, storage, false)
	unsupportedRuntime.mu.Lock()
	unsupportedRuntime.stdin = &countingWriteCloser{}
	unsupportedRuntime.mu.Unlock()
	installManagerRuntime(unsupportedManager, codexAgentID, unsupportedProfile, unsupportedRuntime)

	items, err := unsupportedManager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, unsupportedProfile)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("unsupported items = %#v, want no sessions", items)
	}
	assertNoSessionListChangedEvent(t, unsupportedEvents)
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsSkipsUnsupportedNativeList(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	persistedTitle := "Persisted native session"
	if _, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "persisted-1",
		Title:             &persistedTitle,
		NativeTitle:       &persistedTitle,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
	}); err != nil {
		t.Fatal(err)
	}
	runtime := newReadySessionListRuntime(t, storage, false)
	writer := &countingWriteCloser{}
	runtime.mu.Lock()
	runtime.stdin = writer
	runtime.mu.Unlock()
	installManagerRuntime(manager, codexAgentID, profile, runtime)

	items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %#v, want persisted item", items)
	}
	if items[0].Session.ExternalSessionID == nil || *items[0].Session.ExternalSessionID != "persisted-1" {
		t.Fatalf("items = %#v", items)
	}
	if writer.writes != 0 {
		t.Fatalf("ACP writes = %d, want 0", writer.writes)
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsMarksRuntimeFailedOnListError(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	persistedTitle := "Persisted after list failure"
	if _, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "persisted-after-list-failure",
		Title:             &persistedTitle,
		NativeTitle:       &persistedTitle,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
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

	resultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		resultCh <- managerSyncResult{items: items, err: err}
	}()

	respondToSessionListRequestError(t, decoder, runtime, nativePathString(workspace.Path), nil, "native list failed")

	result := receiveManagerSyncResult(t, resultCh)
	if result.err != nil {
		t.Fatal(result.err)
	}
	if len(result.items) != 1 {
		t.Fatalf("items = %#v, want persisted item", result.items)
	}
	status := manager.statusForMode(manager.configs[codexAgentID], permissionManual)
	if status.State != "failed" {
		t.Fatalf("runtime status = %#v, want failed", status)
	}
	if status.Message == nil || !strings.Contains(*status.Message, "native list failed") {
		t.Fatalf("runtime status message = %#v, want list failure", status.Message)
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsClearsRuntimeResourcesAfterListError(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "missing-acp-runtime-for-sync-retry-test")
	persistedTitle := "Persisted before retry"
	if _, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "persisted-before-retry",
		Title:             &persistedTitle,
		NativeTitle:       &persistedTitle,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
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

	resultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		resultCh <- managerSyncResult{items: items, err: err}
	}()
	respondToSessionListRequestError(t, decoder, runtime, nativePathString(workspace.Path), nil, "native list failed")
	result := receiveManagerSyncResult(t, resultCh)
	if result.err != nil {
		t.Fatal(result.err)
	}

	runtime.mu.Lock()
	stdinAfterFailure := runtime.stdin
	cmdAfterFailure := runtime.cmd
	pendingAfterFailure := len(runtime.pending)
	runtime.mu.Unlock()
	if stdinAfterFailure != nil || cmdAfterFailure != nil || pendingAfterFailure != 0 {
		t.Fatalf("runtime resources after failure: stdin=%v cmd=%v pending=%d, want cleared", stdinAfterFailure, cmdAfterFailure, pendingAfterFailure)
	}

	items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("retry items = %#v, want persisted item", items)
	}
	runtime.mu.Lock()
	stdinAfterRetry := runtime.stdin
	runtime.mu.Unlock()
	if stdinAfterRetry != nil {
		t.Fatalf("runtime stdin after retry = %v, want nil after failed restart", stdinAfterRetry)
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsDoesNotFailRuntimeOnCanceledList(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "unused-acp")
	persistedTitle := "Persisted after cancellation"
	if _, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "persisted-after-cancel",
		Title:             &persistedTitle,
		NativeTitle:       &persistedTitle,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
	}); err != nil {
		t.Fatal(err)
	}
	runtime := newReadySessionListRuntime(t, storage, true)
	writer := &countingWriteCloser{}
	runtime.mu.Lock()
	runtime.stdin = writer
	runtime.mu.Unlock()
	installManagerRuntime(manager, codexAgentID, profile, runtime)
	canceledCtx, cancel := context.WithCancel(ctx)
	cancel()

	items, err := manager.SyncWorkspaceAgentSessions(canceledCtx, workspace, codexAgentID, profile)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %#v, want persisted item", items)
	}
	status := manager.statusForMode(manager.configs[codexAgentID], permissionManual)
	if status.State != "ready" {
		t.Fatalf("runtime status = %#v, want ready", status)
	}
	runtime.mu.Lock()
	pending := len(runtime.pending)
	runtime.mu.Unlock()
	if pending != 0 {
		t.Fatalf("pending requests = %d, want 0 after canceled list", pending)
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsIgnoresOtherCWD(t *testing.T) {
	ctx := context.Background()
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

	resultCh := make(chan managerSyncResult, 1)
	go func() {
		items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
		resultCh <- managerSyncResult{items: items, err: err}
	}()

	otherCWD := nativePathString(t.TempDir())
	respondToSessionListRequest(t, decoder, runtime, nativePathString(workspace.Path), nil, ACPSessionListResult{
		Sessions: []ACPSessionListItem{{
			SessionID: "external-other",
			CWD:       otherCWD,
		}},
	})

	result := receiveManagerSyncResult(t, resultCh)
	if result.err != nil {
		t.Fatal(result.err)
	}
	if len(result.items) != 0 {
		t.Fatalf("items = %#v, want no imported sessions", result.items)
	}
}

func TestAgentRuntimeManagerSyncWorkspaceAgentSessionsReturnsPersistedRowsOnStartupFailure(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	manager, profile := testSessionSyncManager(t, storage, "missing-acp-runtime-for-sync-test")
	persistedTitle := "Persisted after failure"
	if _, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "persisted-after-failure",
		Title:             &persistedTitle,
		NativeTitle:       &persistedTitle,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
	}); err != nil {
		t.Fatal(err)
	}

	items, err := manager.SyncWorkspaceAgentSessions(ctx, workspace, codexAgentID, profile)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %#v, want persisted item", items)
	}
	status := manager.statusForMode(manager.configs[codexAgentID], permissionManual)
	if status.State != "failed" {
		t.Fatalf("runtime status = %#v, want failed", status)
	}
}

func TestAgentRuntimeSurvivesStartupContextCancellation(t *testing.T) {
	storage := testStorage(t)
	startsPath := t.TempDir() + string(os.PathSeparator) + "starts.txt"
	runtime := newAgentRuntime(AgentConfig{
		ID:      codexAgentID,
		Title:   "Codex",
		Command: os.Args[0],
		Args: []string{
			"-test.run=TestAgentRuntimeHelperProcess",
			"--",
			"acp-helper",
			startsPath,
		},
		Enabled: true,
	}, permissionManual, storage, newEventHub())

	startCtx, cancelStart := context.WithCancel(context.Background())
	sessions, err := runtime.ListSessions(startCtx, "workspace-cwd")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || sessions[0].SessionID != "helper-session" {
		t.Fatalf("sessions = %#v", sessions)
	}

	cancelStart()
	time.Sleep(200 * time.Millisecond)

	verifyCtx, cancelVerify := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelVerify()
	sessions, err = runtime.ListSessions(verifyCtx, "workspace-cwd")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || sessions[0].SessionID != "helper-session" {
		t.Fatalf("sessions after context cancellation = %#v", sessions)
	}
	starts, err := os.ReadFile(startsPath)
	if err != nil {
		t.Fatal(err)
	}
	if count := strings.Count(string(starts), "start\n"); count != 1 {
		t.Fatalf("helper process starts = %d, want 1", count)
	}
}

func TestAgentRuntimeContinuityTreatsRegisteredExternalSessionAsLive(t *testing.T) {
	storage := testStorage(t)
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	runtime.setStatus(readyStatus(map[string]any{"title": "Codex"}, AgentPromptCapabilities{}, AgentSessionCapabilities{LoadSession: true}))
	externalSessionID := "external-session"
	runtime.RegisterSession(externalSessionID, "local-session")

	continuity := runtime.runtimeSessionContinuity(nil, &externalSessionID)

	if !continuity.Continuable || continuity.State != continuityLive {
		t.Fatalf("continuity = %#v, want live continuable", continuity)
	}
}

func TestAgentRuntimeHelperProcess(t *testing.T) {
	helperArg := -1
	for i, arg := range os.Args {
		if arg == "acp-helper" {
			helperArg = i
			break
		}
	}
	if helperArg < 0 {
		return
	}
	if helperArg+1 < len(os.Args) {
		if file, err := os.OpenFile(os.Args[helperArg+1], os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600); err == nil {
			_, _ = file.WriteString("start\n")
			_ = file.Close()
		}
	}
	decoder := json.NewDecoder(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)
	for {
		var request struct {
			ID     any             `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := decoder.Decode(&request); err != nil {
			os.Exit(0)
		}
		switch request.Method {
		case "initialize":
			_ = encoder.Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      request.ID,
				"result": map[string]any{
					"agentInfo": map[string]any{
						"name":    "helper-codex-acp",
						"title":   "Helper Codex",
						"version": "0.0.0-test",
					},
					"agentCapabilities": map[string]any{
						"loadSession": true,
						"sessionCapabilities": map[string]any{
							"list": map[string]any{},
						},
					},
				},
			})
		case "session/list":
			var params ACPSessionListParams
			_ = json.Unmarshal(request.Params, &params)
			_ = encoder.Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      request.ID,
				"result": map[string]any{
					"sessions": []map[string]any{{
						"sessionId": "helper-session",
						"cwd":       params.CWD,
						"title":     "Helper session",
						"updatedAt": "2026-05-16T00:00:00Z",
					}},
				},
			})
		default:
			_ = encoder.Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      request.ID,
				"error": map[string]any{
					"code":    -32601,
					"message": "method not found",
				},
			})
		}
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

type sessionListCallResult struct {
	sessions []ACPSessionListItem
	err      error
}

type managerSyncResult struct {
	items []SessionListItem
	err   error
}

type sessionListRequestDecodeResult struct {
	request sessionListRequest
	err     error
}

type sessionListRequest struct {
	ID     int64                `json:"id"`
	Method string               `json:"method"`
	Params ACPSessionListParams `json:"params"`
}

const sessionListTestTimeout = 2 * time.Second

func receiveSessionListResult(t *testing.T, ch <-chan sessionListCallResult) sessionListCallResult {
	t.Helper()
	select {
	case result := <-ch:
		return result
	case <-time.After(sessionListTestTimeout):
		t.Fatalf("timed out waiting for ListSessions result")
	}
	return sessionListCallResult{}
}

func receiveManagerSyncResult(t *testing.T, ch <-chan managerSyncResult) managerSyncResult {
	t.Helper()
	select {
	case result := <-ch:
		return result
	case <-time.After(sessionListTestTimeout):
		t.Fatalf("timed out waiting for SyncWorkspaceAgentSessions result")
	}
	return managerSyncResult{}
}

func receiveSessionListChangedEvent(t *testing.T, ch <-chan any) map[string]any {
	t.Helper()
	deadline := time.After(sessionListTestTimeout)
	for {
		select {
		case event := <-ch:
			payload, ok := event.(map[string]any)
			if !ok {
				continue
			}
			if payload["type"] == "session_list_changed" {
				return payload
			}
		case <-deadline:
			t.Fatalf("timed out waiting for session_list_changed event")
		}
	}
}

func assertNoSessionListChangedEvent(t *testing.T, ch <-chan any) {
	t.Helper()
	for {
		select {
		case event := <-ch:
			payload, ok := event.(map[string]any)
			if ok && payload["type"] == "session_list_changed" {
				t.Fatalf("unexpected session_list_changed event: %#v", payload)
			}
		default:
			return
		}
	}
}

func decodeSessionListRequest(t *testing.T, decoder *json.Decoder) sessionListRequest {
	t.Helper()
	ch := make(chan sessionListRequestDecodeResult, 1)
	go func() {
		var request sessionListRequest
		err := decoder.Decode(&request)
		ch <- sessionListRequestDecodeResult{request: request, err: err}
	}()
	select {
	case result := <-ch:
		if result.err != nil {
			t.Fatal(result.err)
		}
		return result.request
	case <-time.After(sessionListTestTimeout):
		t.Fatalf("timed out waiting for session/list request")
	}
	return sessionListRequest{}
}

func respondToSessionListRequest(t *testing.T, decoder *json.Decoder, runtime *AgentRuntime, wantCWD string, wantCursor *string, result ACPSessionListResult) {
	t.Helper()
	request := decodeSessionListRequest(t, decoder)
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

func respondToSessionListRequestError(t *testing.T, decoder *json.Decoder, runtime *AgentRuntime, wantCWD string, wantCursor *string, message string) {
	t.Helper()
	request := decodeSessionListRequest(t, decoder)
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
	key := fmt.Sprintf("%d", request.ID)
	runtime.mu.Lock()
	ch := runtime.pending[key]
	delete(runtime.pending, key)
	runtime.mu.Unlock()
	if ch == nil {
		t.Fatalf("pending request %s not found", key)
	}
	ch <- rpcResponse{Error: &rpcError{Message: message}}
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

func testSessionSyncManager(t *testing.T, storage *Storage, command string) (*AgentRuntimeManager, ResolvedAgentLaunchProfile) {
	t.Helper()
	agent := codexAgentConfig(command, nil, true)
	profile, err := agent.resolveLaunchProfile(permissionManual, nil)
	if err != nil {
		t.Fatal(err)
	}
	manager := &AgentRuntimeManager{
		configs:  map[string]AgentConfig{codexAgentID: agent},
		storage:  storage,
		events:   newEventHub(),
		runtimes: map[string]*AgentRuntime{},
	}
	return manager, profile
}

func installManagerRuntime(manager *AgentRuntimeManager, agentID string, profile ResolvedAgentLaunchProfile, runtime *AgentRuntime) {
	manager.runtimes[agentID+"\x00"+profile.Key] = runtime
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
