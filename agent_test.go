package main

import (
	"context"
	"encoding/json"
	"testing"
)

func TestAgentRuntimeFlushesAssistantChunksBeforeToolCalls(t *testing.T) {
	ctx := context.Background()
	storage, session := testRuntimeSession(t)
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	runtime.RegisterSession("acp-session", session.ID)
	runtime.beginAssistantBuffer(session.ID)

	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "agent_message_chunk",
		"content":       map[string]any{"type": "text", "text": "Before tool."},
	}))
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
	runtime.flushAssistantBuffer(ctx, session.ID, true)

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

func TestAgentRuntimeIgnoresReplayAssistantChunksOutsidePromptTurn(t *testing.T) {
	ctx := context.Background()
	storage, session := testRuntimeSession(t)
	runtime := newAgentRuntime(AgentConfig{ID: codexAgentID, Title: "Codex"}, permissionManual, storage, newEventHub())
	runtime.RegisterSession("acp-session", session.ID)

	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "agent_message_chunk",
		"content":       map[string]any{"type": "text", "text": "Replayed assistant history."},
	}))
	runtime.handleSessionUpdate(sessionUpdate(t, "acp-session", map[string]any{
		"sessionUpdate": "tool_call",
		"toolCallId":    "tool-1",
		"title":         "Replay tool",
		"kind":          "execute",
		"status":        "running",
	}))

	detail, err := storage.SessionDetail(ctx, session.ID, liveContinuity())
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Messages) != 0 {
		t.Fatalf("messages = %#v", detail.Messages)
	}
	if len(detail.Timeline) != 1 {
		t.Fatalf("timeline = %#v", detail.Timeline)
	}
	assertTimelineItem(t, detail.Timeline[0], "tool_call", "Replay tool")
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
	}
}
