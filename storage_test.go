package main

import (
	"context"
	"database/sql"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"acp-webui/migrations"
)

func TestNowStringIsMonotonicWhenClockDoesNotAdvance(t *testing.T) {
	nowStringMu.Lock()
	originalClock := nowStringClock
	originalLast := lastNowStringTime
	fixed := time.Date(2026, 5, 16, 7, 30, 0, 0, time.UTC)
	nowStringClock = func() time.Time { return fixed }
	lastNowStringTime = time.Time{}
	nowStringMu.Unlock()
	t.Cleanup(func() {
		nowStringMu.Lock()
		nowStringClock = originalClock
		lastNowStringTime = originalLast
		nowStringMu.Unlock()
	})

	first := nowString()
	second := nowString()
	third := nowString()

	if !(first < second && second < third) {
		t.Fatalf("timestamps are not monotonic: %q, %q, %q", first, second, third)
	}
}

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

func TestStorageImportsSQLxMigrationState(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "old.db")
	storage, err := openStorage("sqlite://" + dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })

	applyEmbeddedMigrationsForOldSQLxDB(t, storage.db)
	if err := storage.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	var count int
	if err := storage.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 13 {
		t.Fatalf("schema migration count = %d, want 13", count)
	}
}

func TestStorageSessionNativeImportMigration(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}

	requiredColumns := []string{"title", "native_title", "native_updated_at", "import_source", "imported_at"}
	for _, column := range requiredColumns {
		var found int
		if err := storage.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = ?`, column).Scan(&found); err != nil {
			t.Fatal(err)
		}
		if found != 1 {
			t.Fatalf("sessions.%s column missing", column)
		}
	}

	if _, err := storage.db.ExecContext(ctx, `
		INSERT INTO sessions(id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at, external_session_id, continuation_state, agent_id)
		VALUES ('native-a', ?, 'Codex', NULL, 'idle', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'external-1', 'view_only', 'codex')`,
		workspace.ID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.db.ExecContext(ctx, `
		INSERT INTO sessions(id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at, external_session_id, continuation_state, agent_id)
		VALUES ('native-b', ?, 'Claude', NULL, 'idle', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'external-1', 'view_only', 'claude')`,
		workspace.ID,
	); err != nil {
		t.Fatalf("same external id under another agent should be allowed: %v", err)
	}
	if _, err := storage.db.ExecContext(ctx, `
		INSERT INTO sessions(id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at, external_session_id, continuation_state, agent_id)
		VALUES ('native-duplicate', ?, 'Codex', NULL, 'idle', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'external-1', 'view_only', 'codex')`,
		workspace.ID,
	); err == nil {
		t.Fatal("duplicate external id under the same agent should be rejected")
	}
}

func TestStorageImportsNativeSessionProjection(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	profile := ResolvedAgentLaunchProfile{
		ID:             permissionManual,
		Key:            "permission=manual",
		PermissionMode: permissionManual,
		Summary: []AgentControlSelection{{
			ID:         "permission",
			Label:      "Permission",
			Value:      permissionManual,
			ValueLabel: "Manual",
			Category:   "permission",
			Scope:      "launch",
			RiskLevel:  stringPtr("low"),
		}},
	}
	nativeUpdated := "2026-05-15T12:00:00Z"
	imported, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "external-1",
		Title:             stringPtr("Native title"),
		NativeUpdatedAt:   &nativeUpdated,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      "acp_session_list",
	})
	if err != nil {
		t.Fatal(err)
	}
	if imported.ACPSessionID != nil || imported.ExternalSessionID == nil || *imported.ExternalSessionID != "external-1" {
		t.Fatalf("imported session ids = acp:%#v external:%#v", imported.ACPSessionID, imported.ExternalSessionID)
	}
	if imported.Status != statusIdle || imported.Title == nil || *imported.Title != "Native title" {
		t.Fatalf("imported session metadata = %#v", imported)
	}

	updatedTitle := "Renamed native title"
	updated, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       "ignored-workspace",
		AgentID:           codexAgentID,
		AgentName:         "Ignored Agent",
		ExternalSessionID: "external-1",
		Title:             &updatedTitle,
		PermissionMode:    permissionYolo,
		LaunchProfile:     ResolvedAgentLaunchProfile{ID: "ignored", Key: "ignored"},
		ImportSource:      "acp_session_list",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.ID != imported.ID {
		t.Fatalf("upsert created a new row: %s != %s", updated.ID, imported.ID)
	}
	if updated.WorkspaceID != workspace.ID || updated.AgentName != "Codex" || updated.PermissionMode != permissionManual {
		t.Fatalf("upsert mutated preserved fields: %#v", updated)
	}
	if updated.Title == nil || *updated.Title != updatedTitle {
		t.Fatalf("updated title = %#v", updated.Title)
	}

	items, err := storage.ListSessionItemsForAgent(ctx, workspace.ID, codexAgentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Session.ID != imported.ID {
		t.Fatalf("agent-scoped items = %#v", items)
	}
}

func TestStorageImportNativeSessionReportsMaterialProjectionChanges(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	profile := testLaunchProfile()
	title := "Native title"
	nativeUpdatedAt := "2026-05-15T12:00:00Z"
	first, err := storage.ImportNativeSessionWithResult(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "external-change",
		Title:             &title,
		NativeTitle:       &title,
		NativeUpdatedAt:   &nativeUpdatedAt,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !first.Inserted || !first.MaterialChanged {
		t.Fatalf("first import change metadata = %#v, want inserted material change", first)
	}
	originalImportedAt := "2026-05-14T12:00:00Z"
	if _, err := storage.db.ExecContext(ctx, `UPDATE sessions SET imported_at = ? WHERE id = ?`, originalImportedAt, first.Session.ID); err != nil {
		t.Fatal(err)
	}

	second, err := storage.ImportNativeSessionWithResult(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "external-change",
		Title:             &title,
		NativeTitle:       &title,
		NativeUpdatedAt:   &nativeUpdatedAt,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
	})
	if err != nil {
		t.Fatal(err)
	}
	if second.Inserted || second.MaterialChanged {
		t.Fatalf("identical reimport change metadata = %#v, want no material change", second)
	}
	if second.Session.ImportedAt == nil || *second.Session.ImportedAt == originalImportedAt {
		t.Fatalf("imported_at was not refreshed: before %s after %#v", originalImportedAt, second.Session.ImportedAt)
	}

	updatedTitle := "Renamed native title"
	updatedNativeAt := "2026-05-15T13:00:00Z"
	third, err := storage.ImportNativeSessionWithResult(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "external-change",
		Title:             &updatedTitle,
		NativeTitle:       &updatedTitle,
		NativeUpdatedAt:   &updatedNativeAt,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      importSourceACPSessionList,
	})
	if err != nil {
		t.Fatal(err)
	}
	if third.Inserted || !third.MaterialChanged {
		t.Fatalf("updated reimport change metadata = %#v, want material update", third)
	}
}

func TestStorageReimportPreservesLocalUpdatedAtAndProjectsNativeActivity(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	profile := testLaunchProfile()
	initialNativeUpdated := "2026-05-14T12:00:00Z"
	imported, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "external-activity",
		Title:             stringPtr("Original"),
		NativeUpdatedAt:   &initialNativeUpdated,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
	})
	if err != nil {
		t.Fatal(err)
	}
	originalImportedAt := "2026-05-14T12:00:00Z"
	if _, err := storage.db.ExecContext(ctx, `UPDATE sessions SET imported_at = ?, import_source = ?, updated_at = ? WHERE id = ?`, originalImportedAt, "initial_import", originalImportedAt, imported.ID); err != nil {
		t.Fatal(err)
	}
	imported, err = storage.GetSession(ctx, imported.ID)
	if err != nil {
		t.Fatal(err)
	}
	originalUpdatedAt := imported.UpdatedAt
	items, err := storage.ListSessionItemsForAgent(ctx, workspace.ID, codexAgentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d", len(items))
	}
	originalLastActivityAt := items[0].LastActivityAt

	laterNativeUpdated := "2026-05-15T12:00:00Z"
	updatedTitle := "Updated native title"
	updatedNativeTitle := "Updated native display title"
	reimported, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "external-activity",
		Title:             &updatedTitle,
		NativeTitle:       &updatedNativeTitle,
		NativeUpdatedAt:   &laterNativeUpdated,
		PermissionMode:    permissionManual,
		LaunchProfile:     profile,
		ImportSource:      "native_refresh",
	})
	if err != nil {
		t.Fatal(err)
	}
	if reimported.UpdatedAt != originalUpdatedAt {
		t.Fatalf("updated_at changed on reimport: %s != %s", reimported.UpdatedAt, originalUpdatedAt)
	}
	if reimported.NativeUpdatedAt == nil || *reimported.NativeUpdatedAt != laterNativeUpdated {
		t.Fatalf("native_updated_at = %#v, want %s", reimported.NativeUpdatedAt, laterNativeUpdated)
	}
	if reimported.Title == nil || *reimported.Title != updatedTitle {
		t.Fatalf("title = %#v, want %s", reimported.Title, updatedTitle)
	}
	if reimported.NativeTitle == nil || *reimported.NativeTitle != updatedNativeTitle {
		t.Fatalf("native title = %#v, want %s", reimported.NativeTitle, updatedNativeTitle)
	}
	if reimported.ImportSource != "native_refresh" {
		t.Fatalf("import source = %s, want native_refresh", reimported.ImportSource)
	}
	if reimported.ImportedAt == nil || *reimported.ImportedAt == originalImportedAt {
		t.Fatalf("imported_at was not refreshed: before %s after %#v", originalImportedAt, reimported.ImportedAt)
	}
	items, err = storage.ListSessionItemsForAgent(ctx, workspace.ID, codexAgentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if items[0].LastActivityAt != laterNativeUpdated {
		t.Fatalf("last activity = %s, want native updated at %s; original local activity was %s", items[0].LastActivityAt, laterNativeUpdated, originalLastActivityAt)
	}
}

func TestStorageListSessionItemsForAgentFiltersWorkspaceAndAgent(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	firstWorkspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	secondWorkspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}

	firstCodexACP := "first-codex"
	firstCodex, err := storage.CreateSession(ctx, firstWorkspace.ID, codexAgentID, "Codex", &firstCodexACP, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	firstClaudeACP := "first-claude"
	firstClaude, err := storage.CreateSession(ctx, firstWorkspace.ID, claudeAgentID, "Claude", &firstClaudeACP, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	secondCodexACP := "second-codex"
	secondCodex, err := storage.CreateSession(ctx, secondWorkspace.ID, codexAgentID, "Codex", &secondCodexACP, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}

	scopedItems, err := storage.ListSessionItemsForAgent(ctx, firstWorkspace.ID, codexAgentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(scopedItems) != 1 || scopedItems[0].Session.ID != firstCodex.ID {
		t.Fatalf("scoped items = %v, want only %s", sessionListItemIDs(scopedItems), firstCodex.ID)
	}

	workspaceItems, err := storage.ListSessionItems(ctx, &firstWorkspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := sessionListItemIDs(workspaceItems), []string{firstCodex.ID, firstClaude.ID}; !sameStringSet(got, want) {
		t.Fatalf("legacy workspace items = %v, want %v", got, want)
	}

	globalItems, err := storage.ListSessionItems(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := sessionListItemIDs(globalItems), []string{firstCodex.ID, firstClaude.ID, secondCodex.ID}; !sameStringSet(got, want) {
		t.Fatalf("legacy global items = %v, want %v", got, want)
	}
}

func TestStorageSessionListProjectionsIncludeNativeMetadataAndPreserveSummaries(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "acp-projection"
	modelValue := "gpt-5"
	modelName := "GPT-5"
	profile := ResolvedAgentLaunchProfile{
		ID:             permissionFullAuto,
		Key:            "permission=full_auto",
		PermissionMode: permissionFullAuto,
		Summary: []AgentControlSelection{{
			ID:         "permission",
			Label:      "Permission",
			Value:      permissionFullAuto,
			ValueLabel: "Full Auto",
			Category:   "permission",
			Scope:      "launch",
			RiskLevel:  stringPtr("high"),
		}},
	}
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionFullAuto, profile, []SessionConfigOption{{
		ID:           "model",
		Name:         "Model",
		Type:         "select",
		CurrentValue: &modelValue,
		Options: []SessionConfigOptionValue{{
			Value: modelValue,
			Name:  modelName,
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	active, err := storage.StartActiveTurn(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	message, err := storage.CreateMessage(ctx, session.ID, roleUser, "queued prompt", []MessageContentBlock{textBlock("queued prompt")}, statusIdle)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateQueuedPrompt(ctx, session.ID, message.ID, "queued prompt", []MessageContentBlock{textBlock("queued prompt")}); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreatePermissionRequest(ctx, NewPermissionRequest{
		SessionID:    session.ID,
		ACPSessionID: acpSessionID,
		ACPRequestID: "approval-1",
		Title:        "Approve file write",
		Kind:         "write",
		ToolCall:     map[string]any{"toolCallId": "tool-1"},
		Options:      []PermissionOption{{OptionID: "allow", Name: "Allow", Kind: "allow_once"}},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreatePermissionRequest(ctx, NewPermissionRequest{
		SessionID:    session.ID,
		ACPSessionID: acpSessionID,
		ACPRequestID: "approval-2",
		Title:        "Approve command",
		Kind:         "execute",
		ToolCall:     map[string]any{"toolCallId": "tool-2"},
		Options:      []PermissionOption{{OptionID: "allow", Name: "Allow", Kind: "allow_once"}},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateReviewArtifact(ctx, session.ID, nil, "markdown", "Review", "summary", map[string]any{"markdown": "# ok"}, "tool_call"); err != nil {
		t.Fatal(err)
	}
	if err := storage.MarkSessionRestoreFailed(ctx, session.ID, "restore failed"); err != nil {
		t.Fatal(err)
	}

	title := "Projected title"
	nativeTitle := "Native projected title"
	nativeUpdatedAt := "2026-05-15T12:00:00Z"
	importedAt := "2026-05-15T12:01:00Z"
	localUpdatedAt := "2026-05-14T11:00:00Z"
	if _, err := storage.db.ExecContext(ctx, `
		UPDATE sessions
		SET title = ?,
		    native_title = ?,
		    native_updated_at = ?,
		    import_source = ?,
		    imported_at = ?,
		    updated_at = ?
		WHERE id = ?`,
		title, nativeTitle, nativeUpdatedAt, importSourceACPSessionList, importedAt, localUpdatedAt, session.ID,
	); err != nil {
		t.Fatal(err)
	}

	assertProjection := func(t *testing.T, item SessionListItem) {
		t.Helper()
		if item.Session.ID != session.ID || item.Workspace.ID != workspace.ID {
			t.Fatalf("projected identities = session:%s workspace:%s", item.Session.ID, item.Workspace.ID)
		}
		if item.Session.Title == nil || *item.Session.Title != title {
			t.Fatalf("title = %#v, want %s", item.Session.Title, title)
		}
		if item.Session.NativeTitle == nil || *item.Session.NativeTitle != nativeTitle {
			t.Fatalf("native title = %#v, want %s", item.Session.NativeTitle, nativeTitle)
		}
		if item.Session.NativeUpdatedAt == nil || *item.Session.NativeUpdatedAt != nativeUpdatedAt {
			t.Fatalf("native updated at = %#v, want %s", item.Session.NativeUpdatedAt, nativeUpdatedAt)
		}
		if item.Session.ImportSource != importSourceACPSessionList {
			t.Fatalf("import source = %s, want %s", item.Session.ImportSource, importSourceACPSessionList)
		}
		if item.Session.ImportedAt == nil || *item.Session.ImportedAt != importedAt {
			t.Fatalf("imported at = %#v, want %s", item.Session.ImportedAt, importedAt)
		}
		if item.LastActivityAt != nativeUpdatedAt {
			t.Fatalf("last activity = %s, want native updated_at %s", item.LastActivityAt, nativeUpdatedAt)
		}
		if item.CurrentModel == nil || item.CurrentModel.Value != modelValue || item.CurrentModel.Name == nil || *item.CurrentModel.Name != modelName {
			t.Fatalf("current model = %#v", item.CurrentModel)
		}
		if len(item.LaunchControlSummary) != 1 || item.LaunchControlSummary[0].Value != permissionFullAuto {
			t.Fatalf("launch summary = %#v", item.LaunchControlSummary)
		}
		if item.QueuedPromptCount != 1 {
			t.Fatalf("queued prompt count = %d, want 1", item.QueuedPromptCount)
		}
		if item.ActiveTurn == nil || item.ActiveTurn.StartedAt != active.StartedAt {
			t.Fatalf("active turn = %#v, want started at %s", item.ActiveTurn, active.StartedAt)
		}
		if item.PendingPermission == nil || item.PendingPermission.Title != "Approve file write" {
			t.Fatalf("pending permission = %#v", item.PendingPermission)
		}
		if item.QueuedApprovalCount != 1 {
			t.Fatalf("queued approval count = %d, want 1", item.QueuedApprovalCount)
		}
		if item.ReviewArtifactCount != 1 || !item.HasReviewArtifacts {
			t.Fatalf("review availability = count:%d has:%t", item.ReviewArtifactCount, item.HasReviewArtifacts)
		}
		if item.Continuity.State != continuityRestoreFailed || item.Continuity.FailureMessage == nil || *item.Continuity.FailureMessage != "restore failed" {
			t.Fatalf("continuity = %#v", item.Continuity)
		}
		if item.Continuable {
			t.Fatal("continuable = true, want false for restore failure")
		}
		if item.ViewOnlyReason == nil || *item.ViewOnlyReason != "restore failed" {
			t.Fatalf("view-only reason = %#v, want restore failed", item.ViewOnlyReason)
		}
	}

	workspaceItems, err := storage.ListSessionItems(ctx, &workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(workspaceItems) != 1 {
		t.Fatalf("workspace items = %d, want 1", len(workspaceItems))
	}
	assertProjection(t, workspaceItems[0])

	globalItems, err := storage.ListSessionItems(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(globalItems) != 1 {
		t.Fatalf("global items = %d, want 1", len(globalItems))
	}
	assertProjection(t, globalItems[0])

	agentItems, err := storage.ListSessionItemsForAgent(ctx, workspace.ID, codexAgentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(agentItems) != 1 {
		t.Fatalf("agent items = %d, want 1", len(agentItems))
	}
	assertProjection(t, agentItems[0])
}

func TestStorageSessionListProjectionOmitsViewOnlyReasonForContinuableSession(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "acp-continuable"
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.MarkSessionRestoreSucceeded(ctx, session.ID, nil); err != nil {
		t.Fatal(err)
	}

	items, err := storage.ListSessionItemsForAgent(ctx, workspace.ID, codexAgentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if !items[0].Continuable {
		t.Fatal("continuable = false, want true")
	}
	if items[0].ViewOnlyReason != nil {
		t.Fatalf("view-only reason = %#v, want nil", items[0].ViewOnlyReason)
	}
}

func TestStorageImportsSameExternalIDForDifferentAgents(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	first, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "shared-external",
		PermissionMode:    permissionManual,
		LaunchProfile:     testLaunchProfile(),
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           claudeAgentID,
		AgentName:         "Claude",
		ExternalSessionID: "shared-external",
		PermissionMode:    permissionManual,
		LaunchProfile:     testLaunchProfile(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == second.ID {
		t.Fatalf("same external id across agents reused row %s", first.ID)
	}
}

func TestStorageNativeImportDuplicateRetryIsIdempotent(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	seedID := "seed-native"
	_, err = storage.db.ExecContext(ctx, `
		INSERT INTO sessions(
			id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at,
			external_session_id, continuation_state, agent_id, permission_mode,
			launch_profile_id, launch_profile_key, launch_control_summary_json,
			title, native_title, native_updated_at, import_source, imported_at
		)
		VALUES (?, ?, 'Codex', NULL, 'idle', '2026-05-13T12:00:00Z', '2026-05-13T12:00:00Z',
			'duplicate-retry', 'view_only', 'codex', 'manual', 'manual', 'permission=manual',
			'[]', 'Original', 'Original', '2026-05-13T12:00:00Z', 'acp_session_list', '2026-05-13T12:00:00Z')`,
		seedID, workspace.ID,
	)
	if err != nil {
		t.Fatal(err)
	}

	updatedTitle := "After duplicate retry"
	reimported, err := storage.ImportNativeSession(ctx, NativeSessionImport{
		WorkspaceID:       workspace.ID,
		AgentID:           codexAgentID,
		AgentName:         "Codex",
		ExternalSessionID: "duplicate-retry",
		Title:             &updatedTitle,
		PermissionMode:    permissionManual,
		LaunchProfile:     testLaunchProfile(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if reimported.ID != seedID {
		t.Fatalf("duplicate retry returned row %s, want %s", reimported.ID, seedID)
	}
	if reimported.Title == nil || *reimported.Title != updatedTitle {
		t.Fatalf("title = %#v, want %s", reimported.Title, updatedTitle)
	}
}

func TestStorageConcurrentNativeImportsAreIdempotent(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}

	type importResult struct {
		session Session
		err     error
	}
	const attempts = 8
	ready := make(chan struct{}, attempts)
	start := make(chan struct{})
	results := make(chan importResult, attempts)
	for i := 0; i < attempts; i++ {
		go func() {
			ready <- struct{}{}
			<-start
			session, err := storage.ImportNativeSession(ctx, NativeSessionImport{
				WorkspaceID:       workspace.ID,
				AgentID:           codexAgentID,
				AgentName:         "Codex",
				ExternalSessionID: "parallel-import",
				Title:             stringPtr("Parallel import"),
				PermissionMode:    permissionManual,
				LaunchProfile:     testLaunchProfile(),
			})
			results <- importResult{session: session, err: err}
		}()
	}
	for i := 0; i < attempts; i++ {
		<-ready
	}
	close(start)

	var importedID string
	for i := 0; i < attempts; i++ {
		result := <-results
		if result.err != nil {
			t.Fatal(result.err)
		}
		if importedID == "" {
			importedID = result.session.ID
			continue
		}
		if result.session.ID != importedID {
			t.Fatalf("parallel import returned %s, want %s", result.session.ID, importedID)
		}
	}
	var count int
	if err := storage.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions WHERE agent_id = ? AND external_session_id = ?`, codexAgentID, "parallel-import").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("parallel import row count = %d, want 1", count)
	}
}

func sessionListItemIDs(items []SessionListItem) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.Session.ID)
	}
	return ids
}

func sameStringSet(got []string, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	got = append([]string(nil), got...)
	want = append([]string(nil), want...)
	sort.Strings(got)
	sort.Strings(want)
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func testLaunchProfile() ResolvedAgentLaunchProfile {
	return ResolvedAgentLaunchProfile{
		ID:             permissionManual,
		Key:            "permission=manual",
		PermissionMode: permissionManual,
		Summary: []AgentControlSelection{{
			ID:         "permission",
			Label:      "Permission",
			Value:      permissionManual,
			ValueLabel: "Manual",
			Category:   "permission",
			Scope:      "launch",
			RiskLevel:  stringPtr("low"),
		}},
	}
}

func TestStorageStartupExpiresPendingPermissionsAndFailsSessions(t *testing.T) {
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
	if _, err := storage.CreatePermissionRequest(ctx, NewPermissionRequest{
		SessionID:    session.ID,
		ACPSessionID: acpSessionID,
		ACPRequestID: "1",
		Title:        "Run command",
		Kind:         "execute",
		ToolCall:     map[string]any{"toolCallId": "tool-1"},
		Options:      []PermissionOption{{OptionID: "allow", Name: "Allow", Kind: "allow_once"}},
	}); err != nil {
		t.Fatal(err)
	}

	expired, err := storage.expirePendingPermissionRequestsOnStartup(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if expired != 1 {
		t.Fatalf("expired = %d, want 1", expired)
	}
	updated, _ := storage.GetSession(ctx, session.ID)
	if updated.Status != statusFailed {
		t.Fatalf("session status = %s, want failed", updated.Status)
	}
	messages, _ := storage.ListMessages(ctx, session.ID)
	if len(messages) != 1 || messages[0].Role != roleSystem || messages[0].Content != approvalExpiredMessage {
		t.Fatalf("system messages = %#v", messages)
	}
	detail, err := storage.SessionDetail(ctx, session.ID, liveContinuity())
	if err != nil {
		t.Fatal(err)
	}
	if detail.FailureMessage == nil || *detail.FailureMessage != approvalExpiredMessage {
		t.Fatalf("failure message = %#v", detail.FailureMessage)
	}
	foundExpiredPermission := false
	for _, item := range detail.Timeline {
		if item["kind"] == "permission" && item["status"] == permissionExpired {
			foundExpiredPermission = true
		}
	}
	if !foundExpiredPermission {
		t.Fatalf("timeline missing expired permission: %#v", detail.Timeline)
	}
}

func TestStorageRepairsOnlyRestoredRunningSessionsWithoutPendingApproval(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	profile := ResolvedAgentLaunchProfile{ID: permissionManual, Key: "permission=manual", PermissionMode: permissionManual}
	createSession := func(acp string) Session {
		t.Helper()
		session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acp, permissionManual, profile, nil)
		if err != nil {
			t.Fatal(err)
		}
		return session
	}
	restored := createSession("restored")
	live := createSession("live")
	waiting := createSession("waiting")
	_ = storage.MarkSessionRestoreSucceeded(ctx, restored.ID, nil)
	_, _ = storage.StartActiveTurn(ctx, restored.ID)
	_, _ = storage.StartActiveTurn(ctx, live.ID)
	_ = storage.MarkSessionRestoreSucceeded(ctx, waiting.ID, nil)
	_, _ = storage.StartActiveTurn(ctx, waiting.ID)
	if _, err := storage.CreatePermissionRequest(ctx, NewPermissionRequest{
		SessionID:    waiting.ID,
		ACPSessionID: "waiting",
		ACPRequestID: "2",
		Title:        "Approve",
		Kind:         "execute",
		ToolCall:     map[string]any{},
		Options:      []PermissionOption{{OptionID: "allow", Name: "Allow", Kind: "allow_once"}},
	}); err != nil {
		t.Fatal(err)
	}

	repaired, err := storage.repairRestoredRunningSessionsOnStartup(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if repaired != 1 {
		t.Fatalf("repaired = %d, want 1", repaired)
	}
	restoredAfter, _ := storage.GetSession(ctx, restored.ID)
	liveAfter, _ := storage.GetSession(ctx, live.ID)
	waitingAfter, _ := storage.GetSession(ctx, waiting.ID)
	if restoredAfter.Status != statusIdle {
		t.Fatalf("restored status = %s, want idle", restoredAfter.Status)
	}
	if liveAfter.Status != statusRunning {
		t.Fatalf("live status = %s, want running", liveAfter.Status)
	}
	if waitingAfter.Status != statusWaitingApproval {
		t.Fatalf("waiting status = %s, want waiting_approval", waitingAfter.Status)
	}
}

func TestStorageFinalizesRunningAssistantMessagesForSession(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "finalize-assistant"
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	runningAssistant, err := storage.CreateMessage(ctx, session.ID, roleAssistant, "still live", []MessageContentBlock{textBlock("still live")}, statusRunning)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateMessage(ctx, session.ID, roleUser, "queued user", []MessageContentBlock{textBlock("queued user")}, "queued"); err != nil {
		t.Fatal(err)
	}

	finalized, err := storage.finalizeRunningAssistantMessagesForSession(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if finalized != 1 {
		t.Fatalf("finalized = %d, want 1", finalized)
	}
	updated, err := storage.GetMessage(ctx, runningAssistant.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != statusIdle {
		t.Fatalf("assistant status = %s, want idle", updated.Status)
	}
}

func TestStorageRepairsStaleRunningTurnSessions(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	createSession := func(acpSessionID string) Session {
		t.Helper()
		session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
		if err != nil {
			t.Fatal(err)
		}
		return session
	}
	stale := createSession("stale-running")
	waiting := createSession("waiting-running")
	active := createSession("active-running")
	if err := storage.UpdateSessionStatus(ctx, stale.ID, statusRunning); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateMessage(ctx, stale.ID, roleAssistant, "stale assistant", []MessageContentBlock{textBlock("stale assistant")}, statusRunning); err != nil {
		t.Fatal(err)
	}
	if err := storage.UpdateSessionStatus(ctx, waiting.ID, statusRunning); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreatePermissionRequest(ctx, NewPermissionRequest{
		SessionID:    waiting.ID,
		ACPSessionID: "waiting-running",
		ACPRequestID: "approval-1",
		Title:        "Approve",
		Kind:         "execute",
		ToolCall:     map[string]any{},
		Options:      []PermissionOption{{OptionID: "allow", Name: "Allow", Kind: "allow_once"}},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.StartActiveTurn(ctx, active.ID); err != nil {
		t.Fatal(err)
	}

	repaired, err := storage.repairStaleRunningTurnSessions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if repaired != 1 {
		t.Fatalf("repaired = %d, want 1", repaired)
	}
	staleAfter, _ := storage.GetSession(ctx, stale.ID)
	waitingAfter, _ := storage.GetSession(ctx, waiting.ID)
	activeAfter, _ := storage.GetSession(ctx, active.ID)
	if staleAfter.Status != statusIdle {
		t.Fatalf("stale status = %s, want idle", staleAfter.Status)
	}
	if waitingAfter.Status != statusWaitingApproval {
		t.Fatalf("waiting status = %s, want waiting_approval", waitingAfter.Status)
	}
	if activeAfter.Status != statusRunning {
		t.Fatalf("active status = %s, want running", activeAfter.Status)
	}
	messages, err := storage.ListMessages(ctx, stale.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Status != statusIdle {
		t.Fatalf("stale messages = %#v, want finalized assistant", messages)
	}
}

func TestStorageRepairsQueuedPromptsForTerminalSessions(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "terminal-queued"
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	message, err := storage.CreateMessage(ctx, session.ID, roleUser, "queued prompt", []MessageContentBlock{textBlock("queued prompt")}, "queued")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateQueuedPrompt(ctx, session.ID, message.ID, "queued prompt", []MessageContentBlock{textBlock("queued prompt")}); err != nil {
		t.Fatal(err)
	}
	if err := storage.UpdateSessionStatus(ctx, session.ID, statusFailed); err != nil {
		t.Fatal(err)
	}

	repaired, err := storage.repairQueuedPromptsForTerminalSessions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if repaired != 1 {
		t.Fatalf("repaired = %d, want 1", repaired)
	}
	queued, err := storage.ListQueuedPrompts(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(queued) != 0 {
		t.Fatalf("queued prompts = %#v, want none", queued)
	}
	messages, err := storage.ListMessages(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Status != statusFailed {
		t.Fatalf("message status = %#v, want failed", messages)
	}
}

func TestStorageClearQueuedPromptsMarksPendingQueueCancelled(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "clear-queued"
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	message, err := storage.CreateMessage(ctx, session.ID, roleUser, "queued prompt", []MessageContentBlock{textBlock("queued prompt")}, queuedPromptQueued)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateQueuedPrompt(ctx, session.ID, message.ID, "queued prompt", []MessageContentBlock{textBlock("queued prompt")}); err != nil {
		t.Fatal(err)
	}

	cleared, err := storage.ClearQueuedPrompts(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cleared != 1 {
		t.Fatalf("cleared = %d, want 1", cleared)
	}
	queued, err := storage.ListQueuedPrompts(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(queued) != 0 {
		t.Fatalf("queued prompts = %#v, want none", queued)
	}
	messages, err := storage.ListMessages(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Status != statusStopped {
		t.Fatalf("message status = %#v, want stopped", messages)
	}
	if count := storage.count(ctx, `SELECT COUNT(*) FROM queued_prompts WHERE session_id = ? AND status = ?`, session.ID, queuedPromptCancelled); count != 1 {
		t.Fatalf("cancelled queued prompt count = %d, want 1", count)
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

func TestStorageWorkspaceAndSessionManagementCRUD(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	firstDir := t.TempDir()
	workspace, err := storage.CreateWorkspace(ctx, firstDir, stringPtr("Original"))
	if err != nil {
		t.Fatal(err)
	}
	secondDir := t.TempDir()
	updated, err := storage.UpdateWorkspace(ctx, workspace.ID, WorkspaceUpdate{Name: stringPtr("Renamed"), Path: &secondDir})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Renamed" || updated.Path == workspace.Path {
		t.Fatalf("updated workspace = %#v", updated)
	}

	acpSessionID := "management-acp-session"
	session, err := storage.CreateSession(ctx, updated.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := storage.UpdateSessionMetadata(ctx, session.ID, SessionMetadataUpdate{Title: stringPtr("Managed title")})
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Title == nil || *renamed.Title != "Managed title" || renamed.ACPSessionID == nil || *renamed.ACPSessionID != acpSessionID {
		t.Fatalf("renamed session = %#v", renamed)
	}

	message, err := storage.CreateMessage(ctx, session.ID, roleUser, "hello", []MessageContentBlock{textBlock("hello")}, statusIdle)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateReviewArtifact(ctx, session.ID, nil, "markdown", "Evidence", "summary", map[string]any{"markdown": "# ok"}, "tool_call"); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.CreateQueuedPrompt(ctx, session.ID, message.ID, "queued", []MessageContentBlock{textBlock("queued")}); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.DeleteSession(ctx, session.ID); err == nil || !strings.Contains(err.Error(), "queued prompts") {
		t.Fatalf("delete with queued prompt error = %v", err)
	}
	if err := storage.MarkQueuedPromptsFailed(ctx, session.ID); err != nil {
		t.Fatal(err)
	}
	deleted, err := storage.DeleteSession(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.ID != session.ID {
		t.Fatalf("deleted session = %#v", deleted)
	}
	if _, err := storage.GetSession(ctx, session.ID); err != sql.ErrNoRows {
		t.Fatalf("deleted session lookup error = %v, want sql.ErrNoRows", err)
	}
	if count := storage.count(ctx, `SELECT COUNT(*) FROM messages WHERE session_id = ?`, session.ID); count != 0 {
		t.Fatalf("message count after delete = %d, want 0", count)
	}
	if count := storage.count(ctx, `SELECT COUNT(*) FROM review_artifacts WHERE session_id = ?`, session.ID); count != 0 {
		t.Fatalf("review artifact count after delete = %d, want 0", count)
	}
}

func TestStorageDeleteWorkspaceBlocksActiveSessionsAndCascades(t *testing.T) {
	ctx := context.Background()
	storage := testStorage(t)
	workspace, err := storage.CreateWorkspace(ctx, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	acpSessionID := "workspace-delete-acp-session"
	session, err := storage.CreateSession(ctx, workspace.ID, codexAgentID, "Codex", &acpSessionID, permissionManual, testLaunchProfile(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.StartActiveTurn(ctx, session.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := storage.DeleteWorkspace(ctx, workspace.ID); err == nil || !strings.Contains(err.Error(), "active work") {
		t.Fatalf("delete active workspace error = %v", err)
	}
	if err := storage.FinishActiveTurn(ctx, session.ID, statusIdle); err != nil {
		t.Fatal(err)
	}
	plan, err := storage.DeleteWorkspace(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if plan.SessionCount != 1 || plan.BlockingSessionCount != 0 {
		t.Fatalf("delete plan = %#v", plan)
	}
	if _, err := storage.GetWorkspace(ctx, workspace.ID); err != sql.ErrNoRows {
		t.Fatalf("deleted workspace lookup error = %v, want sql.ErrNoRows", err)
	}
	if _, err := storage.GetSession(ctx, session.ID); err != sql.ErrNoRows {
		t.Fatalf("cascaded session lookup error = %v, want sql.ErrNoRows", err)
	}
}

func applyEmbeddedMigrationsForOldSQLxDB(t *testing.T, db *sql.DB) {
	t.Helper()
	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		t.Fatal(err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	var versions []int
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".sql") {
			continue
		}
		sqlBytes, err := migrations.FS.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(sqlBytes)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
		prefix, _, _ := strings.Cut(name, "_")
		version := 0
		for _, ch := range prefix {
			version = version*10 + int(ch-'0')
		}
		versions = append(versions, version)
	}
	if _, err := db.Exec(`
		CREATE TABLE _sqlx_migrations (
			version BIGINT PRIMARY KEY,
			description TEXT NOT NULL,
			installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			success BOOLEAN NOT NULL,
			checksum BLOB NOT NULL,
			execution_time BIGINT NOT NULL
		)`); err != nil {
		t.Fatal(err)
	}
	for _, version := range versions {
		if _, err := db.Exec(`INSERT INTO _sqlx_migrations(version, description, success, checksum, execution_time) VALUES (?, ?, 1, x'', 0)`, version, "migration"); err != nil {
			t.Fatal(err)
		}
	}
}
