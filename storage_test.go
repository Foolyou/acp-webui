package main

import (
	"context"
	"path/filepath"
	"testing"
)

func testStorage(t *testing.T) *Storage {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	storage, err := openStorage("sqlite://" + dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	if err := storage.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	return storage
}

func TestStorageCreatesWorkspaceIdempotently(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	dir := t.TempDir()
	first, err := storage.CreateWorkspace(ctx, dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := storage.CreateWorkspace(ctx, dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("workspace was not idempotent: %s != %s", first.ID, second.ID)
	}
}

func TestStorageBuildsSessionDetailTimeline(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	profile := ResolvedAgentLaunchProfile{
		ID:             "manual",
		Key:            "permission=manual",
		PermissionMode: permissionManual,
		Summary: []AgentControlSelection{{
			ID:         "permission",
			Label:      "Permission",
			Value:      "manual",
			ValueLabel: "Manual",
			Category:   "permission",
			Scope:      "launch",
			RiskLevel:  stringPtr("low"),
		}},
	}
	acpSessionID := "acp-session"
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, profile, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateMessage(ctx, session.ID, roleUser, "hello", []MessageContentBlock{textBlock("hello")}, statusIdle); err != nil {
		t.Fatal(err)
	}
	artifact, err := storage.CreateReviewArtifact(ctx, session.ID, nil, "markdown", "Evidence", "summary", map[string]any{"markdown": "# ok"}, "tool_call")
	if err != nil {
		t.Fatal(err)
	}
	detail, err := storage.SessionDetail(ctx, session.ID, liveContinuity())
	if err != nil {
		t.Fatal(err)
	}
	if detail.Session.ID != session.ID || detail.Workspace.ID != workspace.ID {
		t.Fatalf("detail has wrong identity: %#v", detail)
	}
	if len(detail.Messages) != 1 {
		t.Fatalf("messages = %d", len(detail.Messages))
	}
	if len(detail.ReviewArtifacts) != 1 || detail.ReviewArtifacts[0].ID != artifact.ID {
		t.Fatalf("review artifacts = %#v", detail.ReviewArtifacts)
	}
	if len(detail.Timeline) < 2 {
		t.Fatalf("timeline = %#v", detail.Timeline)
	}
}
