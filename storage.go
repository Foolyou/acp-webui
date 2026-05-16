package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"acp-webui/migrations"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type Storage struct {
	db *sql.DB
	mu sync.Mutex
}

const approvalExpiredMessage = "Approval expired because the backend restarted. Start a new turn to continue."

type NewPermissionRequest struct {
	SessionID    string
	ACPSessionID string
	ACPRequestID string
	ToolCallID   *string
	Title        string
	Kind         string
	ToolCall     any
	Options      []PermissionOption
}

type NativeSessionImport struct {
	WorkspaceID       string
	AgentID           string
	AgentName         string
	ExternalSessionID string
	Title             *string
	NativeTitle       *string
	NativeUpdatedAt   *string
	PermissionMode    string
	LaunchProfile     ResolvedAgentLaunchProfile
	ImportSource      string
}

type NativeSessionImportResult struct {
	Session         Session
	Inserted        bool
	MaterialChanged bool
}

func openStorage(databaseURL string) (*Storage, error) {
	path := sqlitePathFromURL(databaseURL)
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Storage{db: db}, nil
}

func (s *Storage) Close() error {
	return s.db.Close()
}

func (s *Storage) Migrate(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL)`); err != nil {
		return err
	}
	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	if err := s.importSQLxMigrationState(ctx, entries); err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name = ?`, entry.Name()).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		sqlBytes, err := migrations.FS.ReadFile(entry.Name())
		if err != nil {
			return err
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %s failed: %w", entry.Name(), err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(name) VALUES (?)`, entry.Name()); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func (s *Storage) importSQLxMigrationState(ctx context.Context, entries []fs.DirEntry) error {
	var tableName string
	err := s.db.QueryRowContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'`).Scan(&tableName)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}

	byVersion := map[int64]string{}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(name, "_")
		if !ok {
			continue
		}
		version, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil {
			continue
		}
		byVersion[version] = name
	}

	rows, err := s.db.QueryContext(ctx, `SELECT version FROM _sqlx_migrations WHERE success = 1`)
	if err != nil {
		return err
	}
	var versions []int64
	for rows.Next() {
		var version int64
		if err := rows.Scan(&version); err != nil {
			_ = rows.Close()
			return err
		}
		versions = append(versions, version)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, version := range versions {
		name := byVersion[version]
		if name == "" {
			continue
		}
		if _, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)`, name); err != nil {
			return err
		}
	}
	return nil
}

func (s *Storage) expirePendingPermissionRequestsOnStartup(ctx context.Context) (int64, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id
		FROM permission_requests
		WHERE status = ?
		ORDER BY created_at ASC, id ASC`,
		permissionPending,
	)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type pendingRow struct {
		id        string
		sessionID string
	}
	var pending []pendingRow
	for rows.Next() {
		var row pendingRow
		if err := rows.Scan(&row.id, &row.sessionID); err != nil {
			return 0, err
		}
		pending = append(pending, row)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	failedSessions := map[string]struct{}{}
	for _, row := range pending {
		if _, err := s.db.ExecContext(ctx, `
		UPDATE permission_requests
		SET status = ?, failure_message = ?, resolved_at = COALESCE(resolved_at, ?)
		WHERE id = ? AND status = ?`,
			permissionExpired,
			approvalExpiredMessage,
			nowString(),
			row.id,
			permissionPending,
		); err != nil {
			return 0, err
		}
		if _, seen := failedSessions[row.sessionID]; seen {
			continue
		}
		failedSessions[row.sessionID] = struct{}{}
		if _, err := s.db.ExecContext(ctx, `UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`, statusFailed, nowString(), row.sessionID); err != nil {
			return 0, err
		}
		if _, err := s.AddSystemMessage(ctx, row.sessionID, approvalExpiredMessage); err != nil {
			return 0, err
		}
	}
	return int64(len(pending)), nil
}

func (s *Storage) repairRestoredRunningSessionsOnStartup(ctx context.Context) (int64, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE sessions
		SET status = ?,
		    active_turn_started_at = NULL,
		    active_turn_status = NULL,
		    active_turn_stop_requested_at = NULL,
		    updated_at = ?
		WHERE continuation_state = ?
		  AND status = ?
		  AND NOT EXISTS (
		      SELECT 1
		      FROM permission_requests
		      WHERE permission_requests.session_id = sessions.id
		        AND permission_requests.status = ?
		  )`,
		statusIdle, nowString(), continuityRestored, statusRunning, permissionPending,
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *Storage) repairStaleRunningTurnSessions(ctx context.Context) (int64, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id
		FROM sessions
		WHERE status IN (?, ?)
		  AND (active_turn_started_at IS NULL OR active_turn_status IS NULL)
		  AND NOT EXISTS (
		      SELECT 1
		      FROM permission_requests
		      WHERE permission_requests.session_id = sessions.id
		        AND permission_requests.status = ?
		  )`,
		statusRunning, statusStopping, permissionPending,
	)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var sessionIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return 0, err
		}
		sessionIDs = append(sessionIDs, id)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, sessionID := range sessionIDs {
		if _, err := s.finalizeRunningAssistantMessagesForSession(ctx, sessionID); err != nil {
			return 0, err
		}
		if _, err := s.db.ExecContext(ctx, `
			UPDATE sessions
			SET status = ?,
			    active_turn_started_at = NULL,
			    active_turn_status = NULL,
			    active_turn_stop_requested_at = NULL,
			    updated_at = ?
			WHERE id = ?`,
			statusIdle, nowString(), sessionID,
		); err != nil {
			return 0, err
		}
	}
	return int64(len(sessionIDs)), nil
}

func (s *Storage) repairQueuedPromptsForTerminalSessions(ctx context.Context) (int64, error) {
	now := nowString()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var queuedCount int64
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM queued_prompts
		JOIN sessions ON sessions.id = queued_prompts.session_id
		WHERE queued_prompts.status = ?
		  AND sessions.status IN (?, ?)`, queuedPromptQueued, statusFailed, statusStopped).Scan(&queuedCount); err != nil {
		return 0, err
	}
	if queuedCount == 0 {
		return 0, tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE messages
		SET status = ?
		WHERE id IN (
			SELECT queued_prompts.message_id
			FROM queued_prompts
			JOIN sessions ON sessions.id = queued_prompts.session_id
			WHERE queued_prompts.status = ?
			  AND sessions.status IN (?, ?)
		)`, statusFailed, queuedPromptQueued, statusFailed, statusStopped); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE queued_prompts
		SET status = ?, submitted_at = ?
		WHERE status = ?
		  AND session_id IN (
			SELECT id
			FROM sessions
			WHERE status IN (?, ?)
		  )`, queuedPromptFailed, now, queuedPromptQueued, statusFailed, statusStopped); err != nil {
		return 0, err
	}
	return queuedCount, tx.Commit()
}

func (s *Storage) CreateWorkspace(ctx context.Context, path string, name *string) (Workspace, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return Workspace{}, err
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return Workspace{}, fmt.Errorf("workspace path is not accessible: %s: %w", path, err)
	}
	info, err := os.Stat(canonical)
	if err != nil {
		return Workspace{}, err
	}
	if !info.IsDir() {
		return Workspace{}, fmt.Errorf("workspace path must be a directory")
	}
	storedPath := nativePathString(canonical)
	if existing, err := s.findWorkspaceByPath(ctx, storedPath); err == nil && existing != nil {
		return *existing, nil
	}
	id := uuid.NewString()
	created := nowString()
	workspaceNameValue := workspaceName(storedPath)
	if name != nil && strings.TrimSpace(*name) != "" {
		workspaceNameValue = strings.TrimSpace(*name)
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO workspaces(id, name, path, created_at) VALUES (?, ?, ?, ?)`, id, workspaceNameValue, storedPath, created)
	if err != nil {
		if existing, findErr := s.findWorkspaceByPath(ctx, storedPath); findErr == nil && existing != nil {
			return *existing, nil
		}
		return Workspace{}, err
	}
	return Workspace{ID: id, Name: workspaceNameValue, Path: storedPath, CreatedAt: created}, nil
}

func (s *Storage) findWorkspaceByPath(ctx context.Context, path string) (*Workspace, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, path, created_at FROM workspaces WHERE path = ?`, path)
	workspace, err := scanWorkspace(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &workspace, nil
}

func (s *Storage) ListWorkspaces(ctx context.Context) ([]Workspace, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, path, created_at FROM workspaces ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var workspaces []Workspace
	for rows.Next() {
		workspace, err := scanWorkspace(rows)
		if err != nil {
			return nil, err
		}
		workspaces = append(workspaces, workspace)
	}
	return workspaces, rows.Err()
}

func (s *Storage) GetWorkspace(ctx context.Context, id string) (Workspace, error) {
	return scanWorkspace(s.db.QueryRowContext(ctx, `SELECT id, name, path, created_at FROM workspaces WHERE id = ?`, id))
}

func scanWorkspace(scanner interface{ Scan(dest ...any) error }) (Workspace, error) {
	var workspace Workspace
	err := scanner.Scan(&workspace.ID, &workspace.Name, &workspace.Path, &workspace.CreatedAt)
	return workspace, err
}

func (s *Storage) CreateSession(ctx context.Context, workspaceID string, agentID string, agentName string, acpSessionID *string, permissionMode string, launchProfile ResolvedAgentLaunchProfile, configOptions []SessionConfigOption) (Session, error) {
	id := uuid.NewString()
	now := nowString()
	configJSON := nullableJSONString(configOptions)
	current := currentModelFromOptions(configOptions)
	var currentID, currentValue, currentName *string
	if current != nil {
		currentID = &current.ConfigID
		currentValue = &current.Value
		currentName = current.Name
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions(
			id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at,
			external_session_id, continuation_state, agent_id, config_options_json,
			current_model_config_id, current_model_value, current_model_name, permission_mode,
			launch_profile_id, launch_profile_key, launch_control_summary_json
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, workspaceID, agentName, acpSessionID, statusIdle, now, now,
		acpSessionID, continuityLive, agentID, configJSON,
		currentID, currentValue, currentName, permissionMode,
		launchProfile.ID, launchProfile.Key, mustJSON(launchProfile.Summary),
	)
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(ctx, id)
}

func (s *Storage) ImportNativeSession(ctx context.Context, input NativeSessionImport) (Session, error) {
	result, err := s.ImportNativeSessionWithResult(ctx, input)
	if err != nil {
		return Session{}, err
	}
	return result.Session, nil
}

func (s *Storage) ImportNativeSessionWithResult(ctx context.Context, input NativeSessionImport) (NativeSessionImportResult, error) {
	if strings.TrimSpace(input.WorkspaceID) == "" {
		return NativeSessionImportResult{}, fmt.Errorf("workspace id is required")
	}
	if strings.TrimSpace(input.AgentID) == "" {
		return NativeSessionImportResult{}, fmt.Errorf("agent id is required")
	}
	if strings.TrimSpace(input.ExternalSessionID) == "" {
		return NativeSessionImportResult{}, fmt.Errorf("external session id is required")
	}
	nativeTitle := input.NativeTitle
	if nativeTitle == nil {
		nativeTitle = input.Title
	}
	importSource := strings.TrimSpace(input.ImportSource)
	if importSource == "" {
		importSource = importSourceACPSessionList
	}
	now := nowString()
	permissionMode := strings.TrimSpace(input.PermissionMode)
	if permissionMode == "" {
		permissionMode = input.LaunchProfile.PermissionMode
	}
	if permissionMode == "" {
		permissionMode = permissionManual
	}
	launchProfileID := strings.TrimSpace(input.LaunchProfile.ID)
	if launchProfileID == "" {
		launchProfileID = permissionMode
	}
	launchProfileKey := strings.TrimSpace(input.LaunchProfile.Key)
	if launchProfileKey == "" {
		launchProfileKey = launchProfileID
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return NativeSessionImportResult{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	existing, err := scanSession(tx.QueryRowContext(ctx, `
		SELECT id, workspace_id, agent_id, agent_name, permission_mode, launch_profile_id, launch_profile_key,
		       title, native_title, native_updated_at, acp_session_id, external_session_id, status,
		       import_source, imported_at, created_at, updated_at
		FROM sessions
		WHERE agent_id = ? AND external_session_id = ?`, input.AgentID, input.ExternalSessionID))
	inserted := false
	if err != nil {
		if err != sql.ErrNoRows {
			return NativeSessionImportResult{}, err
		}
		inserted = true
	}

	id := uuid.NewString()
	err = tx.QueryRowContext(ctx, `
		INSERT INTO sessions(
			id, workspace_id, agent_name, acp_session_id, status, created_at, updated_at,
			external_session_id, continuation_state, agent_id, config_options_json,
			current_model_config_id, current_model_value, current_model_name, permission_mode,
			launch_profile_id, launch_profile_key, launch_control_summary_json,
			title, native_title, native_updated_at, import_source, imported_at
		)
		VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(agent_id, external_session_id)
			WHERE external_session_id IS NOT NULL AND external_session_id <> ''
		DO UPDATE SET
			title = COALESCE(excluded.title, sessions.title),
			native_title = COALESCE(excluded.native_title, sessions.native_title),
			native_updated_at = COALESCE(excluded.native_updated_at, sessions.native_updated_at),
			import_source = excluded.import_source,
			imported_at = excluded.imported_at
		RETURNING id`,
		id, input.WorkspaceID, input.AgentName, statusIdle, now, now,
		input.ExternalSessionID, continuityViewOnly, input.AgentID, permissionMode,
		launchProfileID, launchProfileKey, mustJSON(input.LaunchProfile.Summary),
		input.Title, nativeTitle, input.NativeUpdatedAt, importSource, now,
	).Scan(&id)
	if err != nil {
		return NativeSessionImportResult{}, err
	}
	session, err := scanSession(tx.QueryRowContext(ctx, `
		SELECT id, workspace_id, agent_id, agent_name, permission_mode, launch_profile_id, launch_profile_key,
		       title, native_title, native_updated_at, acp_session_id, external_session_id, status,
		       import_source, imported_at, created_at, updated_at
		FROM sessions WHERE id = ?`, id))
	if err != nil {
		return NativeSessionImportResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return NativeSessionImportResult{}, err
	}
	committed = true

	materialChanged := inserted || nativeImportProjectionChanged(existing, session)
	return NativeSessionImportResult{
		Session:         session,
		Inserted:        inserted,
		MaterialChanged: materialChanged,
	}, nil
}

func nativeImportProjectionChanged(before Session, after Session) bool {
	return !stringPtrEqual(before.Title, after.Title) ||
		!stringPtrEqual(before.NativeTitle, after.NativeTitle) ||
		!stringPtrEqual(before.NativeUpdatedAt, after.NativeUpdatedAt) ||
		before.ImportSource != after.ImportSource
}

func stringPtrEqual(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func (s *Storage) GetSession(ctx context.Context, id string) (Session, error) {
	return scanSession(s.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, agent_id, agent_name, permission_mode, launch_profile_id, launch_profile_key,
		       title, native_title, native_updated_at, acp_session_id, external_session_id, status,
		       import_source, imported_at, created_at, updated_at
		FROM sessions WHERE id = ?`, id))
}

func scanSession(scanner interface{ Scan(dest ...any) error }) (Session, error) {
	var session Session
	var title, nativeTitle, nativeUpdatedAt, acpID, externalID, importSource, importedAt sql.NullString
	err := scanner.Scan(
		&session.ID, &session.WorkspaceID, &session.AgentID, &session.AgentName, &session.PermissionMode,
		&session.LaunchProfileID, &session.LaunchProfileKey, &title, &nativeTitle, &nativeUpdatedAt,
		&acpID, &externalID, &session.Status, &importSource, &importedAt, &session.CreatedAt, &session.UpdatedAt,
	)
	if title.Valid {
		session.Title = &title.String
	}
	if nativeTitle.Valid {
		session.NativeTitle = &nativeTitle.String
	}
	if nativeUpdatedAt.Valid {
		session.NativeUpdatedAt = &nativeUpdatedAt.String
	}
	if acpID.Valid {
		session.ACPSessionID = &acpID.String
	}
	if externalID.Valid {
		session.ExternalSessionID = &externalID.String
	}
	if importSource.Valid {
		session.ImportSource = importSource.String
	} else {
		session.ImportSource = importSourceLocal
	}
	if importedAt.Valid {
		session.ImportedAt = &importedAt.String
	}
	return session, err
}

func (s *Storage) UpdateSessionStatus(ctx context.Context, id string, status string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`, status, nowString(), id)
	return err
}

func (s *Storage) MarkSessionRestoreStarted(ctx context.Context, id string) error {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET continuation_state = ?, restore_started_at = ?, restore_completed_at = NULL, restore_failure_message = NULL, updated_at = ?
		WHERE id = ?`, continuityRestoring, now, now, id)
	return err
}

func (s *Storage) MarkSessionRestoreSucceeded(ctx context.Context, id string, acpSessionID *string) error {
	now := nowString()
	acpID := ""
	if acpSessionID != nil {
		acpID = strings.TrimSpace(*acpSessionID)
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions
		SET continuation_state = ?,
		    restore_completed_at = ?,
		    restore_failure_message = NULL,
		    status = ?,
		    updated_at = ?,
		    acp_session_id = CASE WHEN ? = '' THEN acp_session_id ELSE ? END
		WHERE id = ?`, continuityRestored, now, statusIdle, now, acpID, acpID, id)
	return err
}

func (s *Storage) MarkSessionRestoreFailed(ctx context.Context, id string, message string) error {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET continuation_state = ?, restore_failure_message = ?, status = ?, updated_at = ?
		WHERE id = ?`, continuityRestoreFailed, message, statusIdle, now, id)
	return err
}

func (s *Storage) SessionContinuityRow(ctx context.Context, id string) (SessionContinuity, error) {
	var state string
	var failure, started, completed sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT continuation_state, restore_failure_message, restore_started_at, restore_completed_at FROM sessions WHERE id = ?`, id).Scan(&state, &failure, &started, &completed)
	if err != nil {
		return SessionContinuity{}, err
	}
	switch state {
	case continuityRestoring:
		var value *string
		if started.Valid {
			value = &started.String
		}
		return SessionContinuity{State: continuityRestoring, Restoring: true, Reason: stringPtr("Restoring this agent session..."), RestoreStartedAt: value}, nil
	case continuityRestored:
		var value *string
		if completed.Valid {
			value = &completed.String
		}
		return SessionContinuity{State: continuityRestored, Continuable: true, RestoreCompletedAt: value}, nil
	case continuityRestoreFailed:
		message := "Failed to restore session."
		if failure.Valid {
			message = failure.String
		}
		var value *string
		if started.Valid {
			value = &started.String
		}
		return SessionContinuity{State: continuityRestoreFailed, Reason: &message, FailureMessage: &message, RestoreStartedAt: value}, nil
	case continuityViewOnly:
		return viewOnlyContinuity("This session is not connected to a live agent runtime."), nil
	default:
		return liveContinuity(), nil
	}
}

func (s *Storage) CreateMessage(ctx context.Context, sessionID, role, content string, blocks []MessageContentBlock, status string) (Message, error) {
	id := uuid.NewString()
	created := nowString()
	var blocksJSON *string
	if len(blocks) > 0 {
		value := mustJSON(blocks)
		blocksJSON = &value
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO messages(id, session_id, role, content, status, created_at, content_blocks_json)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, sessionID, role, content, status, created, blocksJSON,
	)
	if err != nil {
		return Message{}, err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET updated_at = ? WHERE id = ?`, created, sessionID)
	return Message{ID: id, SessionID: sessionID, Role: role, Content: content, ContentBlocks: blocks, Status: status, CreatedAt: created}, nil
}

func (s *Storage) AddSystemMessage(ctx context.Context, sessionID, content string) (Message, error) {
	return s.CreateMessage(ctx, sessionID, roleSystem, content, []MessageContentBlock{textBlock(content)}, statusIdle)
}

func (s *Storage) GetMessage(ctx context.Context, id string) (Message, error) {
	return scanMessage(s.db.QueryRowContext(ctx, `SELECT id, session_id, role, content, content_blocks_json, status, created_at FROM messages WHERE id = ?`, id))
}

func (s *Storage) UpdateMessageStatus(ctx context.Context, id string, status string) (Message, error) {
	_, err := s.db.ExecContext(ctx, `UPDATE messages SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return Message{}, err
	}
	return s.GetMessage(ctx, id)
}

func (s *Storage) finalizeRunningAssistantMessagesForSession(ctx context.Context, sessionID string) (int64, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE messages
		SET status = ?
		WHERE session_id = ?
		  AND role = ?
		  AND status = ?`,
		statusIdle, sessionID, roleAssistant, statusRunning,
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *Storage) AppendMessageContentBlocks(ctx context.Context, id string, contentDelta string, blocks []MessageContentBlock, status string) (Message, error) {
	message, err := s.GetMessage(ctx, id)
	if err != nil {
		return Message{}, err
	}
	message.ContentBlocks = append(message.ContentBlocks, blocks...)
	blocksJSON := mustJSON(message.ContentBlocks)
	_, err = s.db.ExecContext(ctx, `
		UPDATE messages
		SET content = content || ?, content_blocks_json = ?, status = ?
		WHERE id = ?`,
		contentDelta, blocksJSON, status, id,
	)
	if err != nil {
		return Message{}, err
	}
	return s.GetMessage(ctx, id)
}

func (s *Storage) CreateMessageIfMissing(ctx context.Context, sessionID, role, content string, blocks []MessageContentBlock, status string) (*Message, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM messages WHERE session_id = ? AND role = ? AND content = ?`, sessionID, role, content).Scan(&count); err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, nil
	}
	message, err := s.CreateMessage(ctx, sessionID, role, content, blocks, status)
	if err != nil {
		return nil, err
	}
	return &message, nil
}

func (s *Storage) HasAssistantMessages(ctx context.Context, sessionID string) (bool, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM messages WHERE session_id = ? AND role = ?`, sessionID, roleAssistant).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Storage) ListMessages(ctx context.Context, sessionID string) ([]Message, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, role, content, content_blocks_json, status, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var messages []Message
	for rows.Next() {
		message, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}
	return messages, rows.Err()
}

func scanMessage(scanner interface{ Scan(dest ...any) error }) (Message, error) {
	var message Message
	var blocksJSON sql.NullString
	err := scanner.Scan(&message.ID, &message.SessionID, &message.Role, &message.Content, &blocksJSON, &message.Status, &message.CreatedAt)
	if err != nil {
		return Message{}, err
	}
	if blocksJSON.Valid && blocksJSON.String != "" {
		_ = json.Unmarshal([]byte(blocksJSON.String), &message.ContentBlocks)
	}
	if message.ContentBlocks == nil {
		message.ContentBlocks = []MessageContentBlock{}
	}
	return message, nil
}

func (s *Storage) StartActiveTurn(ctx context.Context, sessionID string) (*ActiveTurn, error) {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET status = ?, active_turn_started_at = ?, active_turn_status = ?, active_turn_stop_requested_at = NULL, updated_at = ?
		WHERE id = ?`, statusRunning, now, statusRunning, now, sessionID)
	if err != nil {
		return nil, err
	}
	return &ActiveTurn{StartedAt: now, Status: statusRunning}, nil
}

func (s *Storage) RequestActiveTurnStop(ctx context.Context, sessionID string) (*ActiveTurn, error) {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET status = ?, active_turn_status = ?, active_turn_stop_requested_at = ?, updated_at = ?
		WHERE id = ?`, statusStopping, statusStopping, now, now, sessionID)
	if err != nil {
		return nil, err
	}
	return s.ActiveTurnForSession(ctx, sessionID)
}

func (s *Storage) FinishActiveTurn(ctx context.Context, sessionID string, nextStatus string) error {
	if _, err := s.finalizeRunningAssistantMessagesForSession(ctx, sessionID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET status = ?, active_turn_started_at = NULL, active_turn_status = NULL, active_turn_stop_requested_at = NULL, updated_at = ?
		WHERE id = ?`, nextStatus, nowString(), sessionID)
	return err
}

func (s *Storage) ActiveTurnForSession(ctx context.Context, sessionID string) (*ActiveTurn, error) {
	var started, statusValue, stop sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT active_turn_started_at, active_turn_status, active_turn_stop_requested_at FROM sessions WHERE id = ?`, sessionID).Scan(&started, &statusValue, &stop)
	if err != nil {
		return nil, err
	}
	if !started.Valid || !statusValue.Valid {
		return nil, nil
	}
	turn := &ActiveTurn{StartedAt: started.String, Status: statusValue.String}
	if stop.Valid {
		turn.StopRequestedAt = &stop.String
	}
	return turn, nil
}

func (s *Storage) CreateQueuedPrompt(ctx context.Context, sessionID, messageID, prompt string, blocks []MessageContentBlock) (QueuedPrompt, error) {
	id := uuid.NewString()
	created := nowString()
	var position int64
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(position), 0) + 1 FROM queued_prompts WHERE session_id = ?`, sessionID).Scan(&position)
	var blocksJSON *string
	if len(blocks) > 0 {
		value := mustJSON(blocks)
		blocksJSON = &value
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO queued_prompts(id, session_id, message_id, prompt, status, position, created_at, content_blocks_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, sessionID, messageID, prompt, queuedPromptQueued, position, created, blocksJSON,
	)
	if err != nil {
		return QueuedPrompt{}, err
	}
	return QueuedPrompt{ID: id, SessionID: sessionID, MessageID: messageID, Prompt: prompt, ContentBlocks: blocks, Status: queuedPromptQueued, Position: position, CreatedAt: created}, nil
}

func (s *Storage) ListQueuedPrompts(ctx context.Context, sessionID string) ([]QueuedPrompt, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, message_id, prompt, content_blocks_json, status, position, created_at, submitted_at FROM queued_prompts WHERE session_id = ? AND status = ? ORDER BY position ASC, created_at ASC`, sessionID, queuedPromptQueued)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var prompts []QueuedPrompt
	for rows.Next() {
		prompt, err := scanQueuedPrompt(rows)
		if err != nil {
			return nil, err
		}
		prompts = append(prompts, prompt)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return nonNilSlice(prompts), nil
}

func (s *Storage) NextQueuedPrompt(ctx context.Context, sessionID string) (*QueuedPrompt, error) {
	prompt, err := scanQueuedPrompt(s.db.QueryRowContext(ctx, `SELECT id, session_id, message_id, prompt, content_blocks_json, status, position, created_at, submitted_at FROM queued_prompts WHERE session_id = ? AND status = ? ORDER BY position ASC, created_at ASC LIMIT 1`, sessionID, queuedPromptQueued))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &prompt, nil
}

func (s *Storage) MarkQueuedPromptSubmitted(ctx context.Context, id string) error {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `UPDATE queued_prompts SET status = ?, submitted_at = ? WHERE id = ?`, queuedPromptSubmitted, now, id)
	return err
}

func (s *Storage) MarkQueuedPromptsFailed(ctx context.Context, sessionID string) error {
	now := nowString()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		UPDATE messages
		SET status = ?
		WHERE id IN (
			SELECT message_id
			FROM queued_prompts
			WHERE session_id = ? AND status = ?
		)`, statusFailed, sessionID, queuedPromptQueued); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE queued_prompts
		SET status = ?, submitted_at = ?
		WHERE session_id = ? AND status = ?`, queuedPromptFailed, now, sessionID, queuedPromptQueued); err != nil {
		return err
	}
	return tx.Commit()
}

func scanQueuedPrompt(scanner interface{ Scan(dest ...any) error }) (QueuedPrompt, error) {
	var prompt QueuedPrompt
	var blocksJSON, submitted sql.NullString
	err := scanner.Scan(&prompt.ID, &prompt.SessionID, &prompt.MessageID, &prompt.Prompt, &blocksJSON, &prompt.Status, &prompt.Position, &prompt.CreatedAt, &submitted)
	if err != nil {
		return QueuedPrompt{}, err
	}
	if blocksJSON.Valid && blocksJSON.String != "" {
		_ = json.Unmarshal([]byte(blocksJSON.String), &prompt.ContentBlocks)
	}
	if prompt.ContentBlocks == nil {
		prompt.ContentBlocks = []MessageContentBlock{}
	}
	if submitted.Valid {
		prompt.SubmittedAt = &submitted.String
	}
	return prompt, nil
}

func (s *Storage) CreatePermissionRequest(ctx context.Context, input NewPermissionRequest) (PermissionRequest, error) {
	id := uuid.NewString()
	created := nowString()
	toolCallJSON := mustJSON(input.ToolCall)
	optionsJSON := mustJSON(input.Options)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO permission_requests(id, session_id, acp_session_id, acp_request_id, tool_call_id, title, kind, status, tool_call_json, options_json, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, input.SessionID, input.ACPSessionID, input.ACPRequestID, input.ToolCallID, input.Title, input.Kind, permissionPending, toolCallJSON, optionsJSON, created,
	)
	if err != nil {
		return PermissionRequest{}, err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`, statusWaitingApproval, created, input.SessionID)
	return s.GetPermissionRequest(ctx, id)
}

func (s *Storage) GetPermissionRequest(ctx context.Context, id string) (PermissionRequest, error) {
	return scanPermissionRequest(s.db.QueryRowContext(ctx, `
		SELECT id, session_id, acp_session_id, acp_request_id, tool_call_id, title, kind, status,
		       selected_option_id, tool_call_json, options_json, failure_message, created_at, resolved_at
		FROM permission_requests WHERE id = ?`, id))
}

func (s *Storage) PendingPermissionsForSession(ctx context.Context, sessionID string) ([]PermissionRequest, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, acp_session_id, acp_request_id, tool_call_id, title, kind, status,
		       selected_option_id, tool_call_json, options_json, failure_message, created_at, resolved_at
		FROM permission_requests WHERE session_id = ? AND status = ? ORDER BY created_at ASC`, sessionID, permissionPending)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var permissions []PermissionRequest
	for rows.Next() {
		permission, err := scanPermissionRequest(rows)
		if err != nil {
			return nil, err
		}
		permissions = append(permissions, permission)
	}
	return permissions, rows.Err()
}

func (s *Storage) PermissionRequestsForSession(ctx context.Context, sessionID string) ([]PermissionRequest, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, acp_session_id, acp_request_id, tool_call_id, title, kind, status,
		       selected_option_id, tool_call_json, options_json, failure_message, created_at, resolved_at
		FROM permission_requests WHERE session_id = ? ORDER BY created_at ASC, id ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var permissions []PermissionRequest
	for rows.Next() {
		permission, err := scanPermissionRequest(rows)
		if err != nil {
			return nil, err
		}
		permissions = append(permissions, permission)
	}
	return permissions, rows.Err()
}

func (s *Storage) PendingPermissionForSession(ctx context.Context, sessionID string) (*PermissionRequest, error) {
	items, err := s.PendingPermissionsForSession(ctx, sessionID)
	if err != nil || len(items) == 0 {
		return nil, err
	}
	return &items[0], nil
}

func (s *Storage) ResolvePermissionRequest(ctx context.Context, id string, optionID string) (PermissionRequest, error) {
	now := nowString()
	result, err := s.db.ExecContext(ctx, `UPDATE permission_requests SET status = ?, selected_option_id = ?, resolved_at = ? WHERE id = ? AND status = ?`, permissionSelected, optionID, now, id, permissionPending)
	if err != nil {
		return PermissionRequest{}, err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return PermissionRequest{}, sql.ErrNoRows
	}
	return s.GetPermissionRequest(ctx, id)
}

func (s *Storage) CancelPendingPermissionsForSession(ctx context.Context, sessionID string) error {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `UPDATE permission_requests SET status = ?, failure_message = ?, resolved_at = ? WHERE session_id = ? AND status = ?`, permissionCancelled, "Permission request cancelled.", now, sessionID, permissionPending)
	return err
}

func scanPermissionRequest(scanner interface{ Scan(dest ...any) error }) (PermissionRequest, error) {
	var permission PermissionRequest
	var acpRequestID string
	var toolCallID, selected, failure, resolved sql.NullString
	var toolCallJSON, optionsJSON string
	err := scanner.Scan(&permission.ID, &permission.SessionID, &permission.ACPSessionID, &acpRequestID, &toolCallID, &permission.Title, &permission.Kind, &permission.Status, &selected, &toolCallJSON, &optionsJSON, &failure, &permission.CreatedAt, &resolved)
	if err != nil {
		return PermissionRequest{}, err
	}
	if toolCallID.Valid {
		permission.ToolCallID = &toolCallID.String
	}
	if selected.Valid {
		permission.SelectedOptionID = &selected.String
	}
	if failure.Valid {
		permission.FailureMessage = &failure.String
	}
	if resolved.Valid {
		permission.ResolvedAt = &resolved.String
	}
	permission.ToolCall = parseJSONValue(toolCallJSON)
	_ = json.Unmarshal([]byte(optionsJSON), &permission.Options)
	if permission.Options == nil {
		permission.Options = []PermissionOption{}
	}
	return permission, nil
}

func (s *Storage) LatestPermissionFailureForSession(ctx context.Context, sessionID string) (*string, error) {
	var failure sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT failure_message
		FROM permission_requests
		WHERE session_id = ? AND failure_message IS NOT NULL
		ORDER BY resolved_at DESC
		LIMIT 1`, sessionID).Scan(&failure)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !failure.Valid {
		return nil, nil
	}
	return &failure.String, nil
}

func (s *Storage) UpsertToolCall(ctx context.Context, sessionID string, acpToolCallID *string, kind, title, summary, status string, input any, output any) (ToolCall, error) {
	now := nowString()
	inputJSON := mustJSON(input)
	var outputJSON *string
	if output != nil {
		value := mustJSON(output)
		outputJSON = &value
	}
	if acpToolCallID != nil {
		var existingID string
		err := s.db.QueryRowContext(ctx, `SELECT id FROM tool_calls WHERE session_id = ? AND acp_tool_call_id = ?`, sessionID, *acpToolCallID).Scan(&existingID)
		if err == nil {
			var completedAt *string
			if status != statusRunning {
				completedAt = &now
			}
			_, err = s.db.ExecContext(ctx, `UPDATE tool_calls SET kind = ?, title = ?, summary = ?, status = ?, input_json = ?, output_json = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?`, kind, title, summary, status, inputJSON, outputJSON, now, completedAt, existingID)
			if err != nil {
				return ToolCall{}, err
			}
			return s.getToolCall(ctx, existingID)
		}
	}
	id := uuid.NewString()
	var completedAt *string
	if status != statusRunning {
		completedAt = &now
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO tool_calls(id, session_id, acp_tool_call_id, kind, title, summary, status, input_json, output_json, created_at, updated_at, completed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, sessionID, acpToolCallID, kind, title, summary, status, inputJSON, outputJSON, now, now, completedAt,
	)
	if err != nil {
		return ToolCall{}, err
	}
	return s.getToolCall(ctx, id)
}

func (s *Storage) getToolCall(ctx context.Context, id string) (ToolCall, error) {
	return scanToolCall(s.db.QueryRowContext(ctx, `SELECT id, session_id, acp_tool_call_id, kind, title, summary, status, input_json, output_json, created_at, updated_at, completed_at FROM tool_calls WHERE id = ?`, id))
}

func (s *Storage) ListToolCalls(ctx context.Context, sessionID string) ([]ToolCall, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, acp_tool_call_id, kind, title, summary, status, input_json, output_json, created_at, updated_at, completed_at FROM tool_calls WHERE session_id = ? ORDER BY created_at ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var calls []ToolCall
	for rows.Next() {
		call, err := scanToolCall(rows)
		if err != nil {
			return nil, err
		}
		calls = append(calls, call)
	}
	return calls, rows.Err()
}

func scanToolCall(scanner interface{ Scan(dest ...any) error }) (ToolCall, error) {
	var call ToolCall
	var acpID, output, completed sql.NullString
	err := scanner.Scan(&call.ID, &call.SessionID, &acpID, &call.Kind, &call.Title, &call.Summary, &call.Status, &call.InputJSON, &output, &call.CreatedAt, &call.UpdatedAt, &completed)
	if err != nil {
		return ToolCall{}, err
	}
	if acpID.Valid {
		call.ACPToolCallID = &acpID.String
	}
	if output.Valid {
		call.OutputJSON = &output.String
	}
	if completed.Valid {
		call.CompletedAt = &completed.String
	}
	call.ReviewArtifactIDs = []string{}
	return call, nil
}

func (s *Storage) CreateReviewArtifact(ctx context.Context, sessionID string, toolCallID *string, kind, title, summary string, payload any, source string) (ReviewArtifact, error) {
	id := uuid.NewString()
	created := nowString()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO review_artifacts(id, session_id, tool_call_id, kind, title, summary, payload_json, source, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, sessionID, toolCallID, kind, title, summary, mustJSON(payload), source, created,
	)
	if err != nil {
		return ReviewArtifact{}, err
	}
	return s.GetReviewArtifactForSession(ctx, sessionID, id)
}

type UpsertReviewArtifactResult struct {
	Artifact ReviewArtifact
	Created  bool
}

func (s *Storage) UpsertReviewArtifact(ctx context.Context, sessionID string, toolCallID *string, kind, title, summary string, payload any, source string) (UpsertReviewArtifactResult, error) {
	if toolCallID != nil {
		existing, err := s.findReviewArtifactForToolCall(ctx, sessionID, *toolCallID, kind, source)
		if err != nil {
			return UpsertReviewArtifactResult{}, err
		}
		if existing != nil {
			_, err := s.db.ExecContext(ctx, `
				UPDATE review_artifacts
				SET title = ?, summary = ?, payload_json = ?
				WHERE id = ?`,
				title, summary, mustJSON(payload), existing.ID,
			)
			if err != nil {
				return UpsertReviewArtifactResult{}, err
			}
			artifact, err := s.GetReviewArtifactForSession(ctx, sessionID, existing.ID)
			return UpsertReviewArtifactResult{Artifact: artifact, Created: false}, err
		}
	}
	artifact, err := s.CreateReviewArtifact(ctx, sessionID, toolCallID, kind, title, summary, payload, source)
	return UpsertReviewArtifactResult{Artifact: artifact, Created: true}, err
}

func (s *Storage) findReviewArtifactForToolCall(ctx context.Context, sessionID, toolCallID, kind, source string) (*ReviewArtifactSummary, error) {
	summary, _, err := scanReviewArtifact(s.db.QueryRowContext(ctx, `
		SELECT id, session_id, tool_call_id, kind, title, summary, payload_json, source, created_at
		FROM review_artifacts
		WHERE session_id = ? AND tool_call_id = ? AND kind = ? AND source = ?
		ORDER BY created_at DESC
		LIMIT 1`,
		sessionID, toolCallID, kind, source,
	))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &summary, nil
}

func (s *Storage) ListReviewArtifactSummaries(ctx context.Context, sessionID string) ([]ReviewArtifactSummary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, tool_call_id, kind, title, summary, payload_json, source, created_at FROM review_artifacts WHERE session_id = ? ORDER BY created_at ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var artifacts []ReviewArtifactSummary
	for rows.Next() {
		artifact, _, err := scanReviewArtifact(rows)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, artifact)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return dedupeReviewArtifactSummaries(artifacts), nil
}

func (s *Storage) GetReviewArtifactForSession(ctx context.Context, sessionID, artifactID string) (ReviewArtifact, error) {
	summary, payload, err := scanReviewArtifact(s.db.QueryRowContext(ctx, `SELECT id, session_id, tool_call_id, kind, title, summary, payload_json, source, created_at FROM review_artifacts WHERE session_id = ? AND id = ?`, sessionID, artifactID))
	if err != nil {
		return ReviewArtifact{}, err
	}
	return ReviewArtifact{ID: summary.ID, SessionID: summary.SessionID, ToolCallID: summary.ToolCallID, Kind: summary.Kind, Title: summary.Title, Summary: summary.Summary, Payload: payload, Source: summary.Source, CreatedAt: summary.CreatedAt}, nil
}

func scanReviewArtifact(scanner interface{ Scan(dest ...any) error }) (ReviewArtifactSummary, any, error) {
	var artifact ReviewArtifactSummary
	var toolCallID sql.NullString
	var payloadJSON string
	err := scanner.Scan(&artifact.ID, &artifact.SessionID, &toolCallID, &artifact.Kind, &artifact.Title, &artifact.Summary, &payloadJSON, &artifact.Source, &artifact.CreatedAt)
	if err != nil {
		return ReviewArtifactSummary{}, nil, err
	}
	if toolCallID.Valid {
		artifact.ToolCallID = &toolCallID.String
	}
	payload := parseJSONValue(payloadJSON)
	artifact.Preview = previewFromPayload(artifact.Kind, payload)
	return artifact, payload, nil
}

func previewFromPayload(kind string, payload any) any {
	if kind != "image" {
		return nil
	}
	if object, ok := payload.(map[string]any); ok {
		return map[string]any{
			"mimeType":   object["mimeType"],
			"data":       object["data"],
			"name":       object["name"],
			"caption":    object["caption"],
			"sourcePath": object["sourcePath"],
		}
	}
	return nil
}

func dedupeReviewArtifactSummaries(items []ReviewArtifactSummary) []ReviewArtifactSummary {
	seen := map[string]struct{}{}
	dedupedReversed := make([]ReviewArtifactSummary, 0, len(items))
	for i := len(items) - 1; i >= 0; i-- {
		key := reviewArtifactSummaryDedupeKey(items[i])
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		dedupedReversed = append(dedupedReversed, items[i])
	}
	deduped := make([]ReviewArtifactSummary, 0, len(dedupedReversed))
	for i := len(dedupedReversed) - 1; i >= 0; i-- {
		deduped = append(deduped, dedupedReversed[i])
	}
	return deduped
}

func reviewArtifactSummaryDedupeKey(item ReviewArtifactSummary) string {
	if item.Kind == "image" {
		if preview, ok := item.Preview.(map[string]any); ok {
			if raw, ok := preview["sourcePath"].(string); ok && raw != "" {
				if item.ToolCallID != nil {
					return fmt.Sprintf("tool:%s|%s|%s|%s", *item.ToolCallID, item.Kind, item.Source, raw)
				}
				return fmt.Sprintf("image:%s|%s", item.Source, raw)
			}
		}
	}
	if item.ToolCallID != nil {
		return fmt.Sprintf("tool:%s|%s|%s", *item.ToolCallID, item.Kind, item.Source)
	}
	return "artifact:" + item.ID
}

func (s *Storage) UpdateSessionConfigOptions(ctx context.Context, sessionID string, options []SessionConfigOption) (SessionConfigState, error) {
	configJSON := nullableJSONString(options)
	current := currentModelFromOptions(options)
	var currentID, currentValue, currentName *string
	if current != nil {
		currentID = &current.ConfigID
		currentValue = &current.Value
		currentName = current.Name
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions
		SET config_options_json = ?, current_model_config_id = ?, current_model_value = ?, current_model_name = ?, updated_at = ?
		WHERE id = ?`,
		configJSON, currentID, currentValue, currentName, nowString(), sessionID,
	)
	if err != nil {
		return SessionConfigState{}, err
	}
	return s.SessionConfigState(ctx, sessionID)
}

func (s *Storage) SessionConfigState(ctx context.Context, sessionID string) (SessionConfigState, error) {
	var configJSON, currentID, currentValue, currentName sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT config_options_json, current_model_config_id, current_model_value, current_model_name FROM sessions WHERE id = ?`, sessionID).Scan(&configJSON, &currentID, &currentValue, &currentName)
	if err != nil {
		return SessionConfigState{}, err
	}
	var options []SessionConfigOption
	if configJSON.Valid && configJSON.String != "" {
		_ = json.Unmarshal([]byte(configJSON.String), &options)
	}
	state := SessionConfigState{ConfigOptions: options}
	if currentID.Valid && currentValue.Valid {
		state.CurrentModel = &SessionCurrentModel{ConfigID: currentID.String, Value: currentValue.String}
		if currentName.Valid {
			state.CurrentModel.Name = &currentName.String
		}
	} else {
		state.CurrentModel = currentModelFromOptions(options)
	}
	if state.ConfigOptions == nil {
		state.ConfigOptions = []SessionConfigOption{}
	}
	return state, nil
}

func nullableJSONString[T any](items []T) *string {
	if len(items) == 0 {
		return nil
	}
	value := mustJSON(items)
	return &value
}

func currentModelFromOptions(options []SessionConfigOption) *SessionCurrentModel {
	for _, option := range options {
		if option.ID != "model" || option.CurrentValue == nil {
			continue
		}
		model := &SessionCurrentModel{ConfigID: option.ID, Value: *option.CurrentValue}
		for _, choice := range option.Options {
			if choice.Value == *option.CurrentValue {
				model.Name = &choice.Name
				break
			}
		}
		return model
	}
	return nil
}

func (s *Storage) SessionDetail(ctx context.Context, sessionID string, continuity SessionContinuity) (SessionDetail, error) {
	session, err := s.GetSession(ctx, sessionID)
	if err != nil {
		return SessionDetail{}, err
	}
	workspace, err := s.GetWorkspace(ctx, session.WorkspaceID)
	if err != nil {
		return SessionDetail{}, err
	}
	configState, _ := s.SessionConfigState(ctx, sessionID)
	messages, _ := s.ListMessages(ctx, sessionID)
	queued, _ := s.ListQueuedPrompts(ctx, sessionID)
	active, _ := s.ActiveTurnForSession(ctx, sessionID)
	artifacts, _ := s.ListReviewArtifactSummaries(ctx, sessionID)
	pending, _ := s.PendingPermissionsForSession(ctx, sessionID)
	permissionHistory, _ := s.PermissionRequestsForSession(ctx, sessionID)
	var pendingPtr *PermissionRequest
	if len(pending) > 0 {
		pendingPtr = &pending[0]
		session.Status = statusWaitingApproval
	}
	var failure *string
	if latestFailure, _ := s.LatestPermissionFailureForSession(ctx, sessionID); latestFailure != nil {
		failure = latestFailure
	} else if continuity.FailureMessage != nil {
		failure = continuity.FailureMessage
	}
	launchSummary := s.launchControlSummary(ctx, sessionID)
	timeline, _ := s.timeline(ctx, sessionID, permissionHistory)
	reason := continuity.Reason
	if continuity.Continuable {
		reason = nil
	}
	return SessionDetail{
		Session:              session,
		Workspace:            workspace,
		ConfigOptions:        nonNilSlice(configState.ConfigOptions),
		CurrentModel:         configState.CurrentModel,
		LaunchControlSummary: launchSummary,
		Messages:             nonNilSlice(messages),
		QueuedPrompts:        nonNilSlice(queued),
		ActiveTurn:           active,
		ReviewArtifacts:      nonNilSlice(artifacts),
		Timeline:             nonNilSlice(timeline),
		PendingPermission:    pendingPtr,
		PendingPermissions:   nonNilSlice(pending),
		PendingApprovalCount: int64(len(pending)),
		QueuedApprovalCount:  maxInt64(int64(len(pending)-1), 0),
		FailureMessage:       failure,
		Continuity:           continuity,
		Continuable:          continuity.Continuable,
		ViewOnlyReason:       reason,
	}, nil
}

func (s *Storage) launchControlSummary(ctx context.Context, sessionID string) []AgentControlSelection {
	var raw sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT launch_control_summary_json FROM sessions WHERE id = ?`, sessionID).Scan(&raw)
	if err != nil || !raw.Valid || raw.String == "" {
		return []AgentControlSelection{}
	}
	var summary []AgentControlSelection
	_ = json.Unmarshal([]byte(raw.String), &summary)
	if summary == nil {
		return []AgentControlSelection{}
	}
	return summary
}

func (s *Storage) timeline(ctx context.Context, sessionID string, permissionHistory []PermissionRequest) ([]TimelineItem, error) {
	messages, _ := s.ListMessages(ctx, sessionID)
	toolCalls, _ := s.ListToolCalls(ctx, sessionID)
	artifacts, _ := s.ListReviewArtifactSummaries(ctx, sessionID)
	var timeline []TimelineItem
	for _, message := range messages {
		timeline = append(timeline, TimelineItem{
			"kind":          "message",
			"id":            message.ID,
			"sessionId":     message.SessionID,
			"timestamp":     message.CreatedAt,
			"status":        message.Status,
			"role":          message.Role,
			"content":       message.Content,
			"contentBlocks": message.ContentBlocks,
		})
	}
	artifactIDsByTool := map[string][]string{}
	for _, artifact := range artifacts {
		if artifact.ToolCallID != nil {
			artifactIDsByTool[*artifact.ToolCallID] = append(artifactIDsByTool[*artifact.ToolCallID], artifact.ID)
		}
		timeline = append(timeline, TimelineItem{
			"kind":         "review_artifact",
			"id":           artifact.ID,
			"sessionId":    artifact.SessionID,
			"timestamp":    artifact.CreatedAt,
			"status":       "completed",
			"toolCallId":   artifact.ToolCallID,
			"artifactKind": artifact.Kind,
			"title":        artifact.Title,
			"summary":      artifact.Summary,
			"source":       artifact.Source,
		})
	}
	for _, call := range toolCalls {
		input := parseJSONValue(call.InputJSON)
		var output any
		if call.OutputJSON != nil {
			output = parseJSONValue(*call.OutputJSON)
		}
		var reviewIDs []string
		if call.ACPToolCallID != nil {
			reviewIDs = artifactIDsByTool[*call.ACPToolCallID]
		}
		if reviewIDs == nil {
			reviewIDs = []string{}
		}
		timeline = append(timeline, TimelineItem{
			"kind":              "tool_call",
			"id":                call.ID,
			"sessionId":         call.SessionID,
			"timestamp":         call.CreatedAt,
			"status":            call.Status,
			"toolCallId":        call.ACPToolCallID,
			"toolKind":          call.Kind,
			"title":             call.Title,
			"summary":           call.Summary,
			"input":             input,
			"output":            output,
			"reviewArtifactIds": reviewIDs,
		})
	}
	for _, permission := range permissionHistory {
		timeline = append(timeline, TimelineItem{
			"kind":           "permission",
			"id":             permission.ID,
			"sessionId":      permission.SessionID,
			"timestamp":      permission.CreatedAt,
			"status":         permission.Status,
			"toolCallId":     permission.ToolCallID,
			"title":          permission.Title,
			"permissionKind": permission.Kind,
		})
	}
	sort.SliceStable(timeline, func(i, j int) bool {
		return fmt.Sprint(timeline[i]["timestamp"]) < fmt.Sprint(timeline[j]["timestamp"])
	})
	return timeline, nil
}

func (s *Storage) ListSessionItems(ctx context.Context, workspaceID *string) ([]SessionListItem, error) {
	return s.listSessionItems(ctx, workspaceID, nil)
}

func (s *Storage) ListSessionItemsForAgent(ctx context.Context, workspaceID string, agentID string) ([]SessionListItem, error) {
	return s.listSessionItems(ctx, &workspaceID, &agentID)
}

func (s *Storage) listSessionItems(ctx context.Context, workspaceID *string, agentID *string) ([]SessionListItem, error) {
	query := `
		SELECT s.id, s.workspace_id, s.agent_id, s.agent_name, s.permission_mode, s.launch_profile_id, s.launch_profile_key,
		       s.title, s.native_title, s.native_updated_at, s.acp_session_id, s.external_session_id, s.status,
		       s.import_source, s.imported_at, s.created_at, s.updated_at,
		       CASE
		           WHEN s.native_updated_at IS NOT NULL AND s.native_updated_at > s.updated_at THEN s.native_updated_at
		           ELSE s.updated_at
		       END AS last_activity_at,
		       w.id, w.name, w.path, w.created_at
		FROM sessions s JOIN workspaces w ON w.id = s.workspace_id`
	args := []any{}
	var conditions []string
	if workspaceID != nil {
		conditions = append(conditions, `s.workspace_id = ?`)
		args = append(args, *workspaceID)
	}
	if agentID != nil {
		conditions = append(conditions, `s.agent_id = ?`)
		args = append(args, *agentID)
	}
	if len(conditions) > 0 {
		query += ` WHERE ` + strings.Join(conditions, ` AND `)
	}
	query += ` ORDER BY last_activity_at DESC`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	type sessionListBase struct {
		session        Session
		workspace      Workspace
		lastActivityAt string
	}
	var bases []sessionListBase
	for rows.Next() {
		var session Session
		var workspace Workspace
		var title, nativeTitle, nativeUpdatedAt, acpID, externalID, importSource, importedAt sql.NullString
		var lastActivityAt string
		if err := rows.Scan(
			&session.ID, &session.WorkspaceID, &session.AgentID, &session.AgentName, &session.PermissionMode, &session.LaunchProfileID, &session.LaunchProfileKey,
			&title, &nativeTitle, &nativeUpdatedAt, &acpID, &externalID, &session.Status, &importSource, &importedAt, &session.CreatedAt, &session.UpdatedAt,
			&lastActivityAt,
			&workspace.ID, &workspace.Name, &workspace.Path, &workspace.CreatedAt,
		); err != nil {
			return nil, err
		}
		if title.Valid {
			session.Title = &title.String
		}
		if nativeTitle.Valid {
			session.NativeTitle = &nativeTitle.String
		}
		if nativeUpdatedAt.Valid {
			session.NativeUpdatedAt = &nativeUpdatedAt.String
		}
		if acpID.Valid {
			session.ACPSessionID = &acpID.String
		}
		if externalID.Valid {
			session.ExternalSessionID = &externalID.String
		}
		if importSource.Valid {
			session.ImportSource = importSource.String
		} else {
			session.ImportSource = importSourceLocal
		}
		if importedAt.Valid {
			session.ImportedAt = &importedAt.String
		}
		bases = append(bases, sessionListBase{session: session, workspace: workspace, lastActivityAt: lastActivityAt})
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	var items []SessionListItem
	for _, base := range bases {
		session := base.session
		workspace := base.workspace
		configState, _ := s.SessionConfigState(ctx, session.ID)
		pending, _ := s.PendingPermissionsForSession(ctx, session.ID)
		var pendingList *SessionListPermission
		if len(pending) > 0 {
			pendingList = &SessionListPermission{ID: pending[0].ID, Title: pending[0].Title, Kind: pending[0].Kind, CreatedAt: pending[0].CreatedAt}
			session.Status = statusWaitingApproval
		}
		active, _ := s.ActiveTurnForSession(ctx, session.ID)
		reviewCount := s.count(ctx, `SELECT COUNT(*) FROM review_artifacts WHERE session_id = ?`, session.ID)
		queuedCount := s.count(ctx, `SELECT COUNT(*) FROM queued_prompts WHERE session_id = ? AND status = ?`, session.ID, queuedPromptQueued)
		continuity, _ := s.SessionContinuityRow(ctx, session.ID)
		var viewOnlyReason *string
		if !continuity.Continuable {
			viewOnlyReason = continuity.Reason
		}
		items = append(items, SessionListItem{
			Session:              session,
			Workspace:            workspace,
			LastActivityAt:       base.lastActivityAt,
			CurrentModel:         configState.CurrentModel,
			LaunchControlSummary: s.launchControlSummary(ctx, session.ID),
			QueuedPromptCount:    queuedCount,
			ActiveTurn:           active,
			PendingPermission:    pendingList,
			QueuedApprovalCount:  maxInt64(int64(len(pending)-1), 0),
			ReviewArtifactCount:  reviewCount,
			HasReviewArtifacts:   reviewCount > 0,
			Continuity:           continuity,
			Continuable:          continuity.Continuable,
			ViewOnlyReason:       viewOnlyReason,
		})
	}
	return nonNilSlice(items), nil
}

func (s *Storage) count(ctx context.Context, query string, args ...any) int64 {
	var value int64
	_ = s.db.QueryRowContext(ctx, query, args...).Scan(&value)
	return value
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func (s *Storage) ListInboxItems(ctx context.Context) ([]InboxItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.id, p.session_id, p.acp_session_id, p.acp_request_id, p.tool_call_id, p.title, p.kind, p.status,
		       p.selected_option_id, p.tool_call_json, p.options_json, p.failure_message, p.created_at, p.resolved_at
		FROM permission_requests p
		WHERE p.status = ?
		ORDER BY p.created_at ASC`, permissionPending)
	if err != nil {
		return nil, err
	}
	var permissions []PermissionRequest
	for rows.Next() {
		permission, err := scanPermissionRequest(rows)
		if err != nil {
			return nil, err
		}
		permissions = append(permissions, permission)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	var items []InboxItem
	for _, permission := range permissions {
		session, err := s.GetSession(ctx, permission.SessionID)
		if err != nil {
			return nil, err
		}
		workspace, err := s.GetWorkspace(ctx, session.WorkspaceID)
		if err != nil {
			return nil, err
		}
		pending, _ := s.PendingPermissionsForSession(ctx, session.ID)
		items = append(items, InboxItem{Session: session, Workspace: workspace, Permission: permission, QueuedApprovalCount: maxInt64(int64(len(pending)-1), 0)})
	}
	return nonNilSlice(items), nil
}

func (s *Storage) ListPromptTemplates(ctx context.Context, workspaceID, agentID string) ([]PromptTemplate, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, workspace_id, agent_id, title, body, tags_json, position, use_count, last_used_at, created_at, updated_at, archived_at FROM prompt_templates WHERE workspace_id = ? AND agent_id = ? AND archived_at IS NULL ORDER BY position ASC, last_used_at DESC, updated_at DESC`, workspaceID, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var templates []PromptTemplate
	for rows.Next() {
		template, err := scanPromptTemplate(rows)
		if err != nil {
			return nil, err
		}
		templates = append(templates, template)
	}
	return templates, rows.Err()
}

func (s *Storage) CreatePromptTemplate(ctx context.Context, workspaceID, agentID, title, body string, tags []string, position *int64) (PromptTemplate, error) {
	id := uuid.NewString()
	now := nowString()
	pos := int64(0)
	if position != nil {
		pos = *position
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO prompt_templates(id, workspace_id, agent_id, title, body, tags_json, position, use_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`, id, workspaceID, agentID, title, body, mustJSON(normalizeTags(tags)), pos, now, now)
	if err != nil {
		return PromptTemplate{}, err
	}
	return s.GetPromptTemplate(ctx, id)
}

func (s *Storage) GetPromptTemplate(ctx context.Context, id string) (PromptTemplate, error) {
	return scanPromptTemplate(s.db.QueryRowContext(ctx, `SELECT id, workspace_id, agent_id, title, body, tags_json, position, use_count, last_used_at, created_at, updated_at, archived_at FROM prompt_templates WHERE id = ?`, id))
}

func (s *Storage) UpdatePromptTemplate(ctx context.Context, id string, title, body *string, tags []string, tagsSet bool, position *int64) (PromptTemplate, error) {
	template, err := s.GetPromptTemplate(ctx, id)
	if err != nil {
		return PromptTemplate{}, err
	}
	if title != nil {
		template.Title = *title
	}
	if body != nil {
		template.Body = *body
	}
	if tagsSet {
		template.Tags = normalizeTags(tags)
	}
	if position != nil {
		template.Position = *position
	}
	_, err = s.db.ExecContext(ctx, `UPDATE prompt_templates SET title = ?, body = ?, tags_json = ?, position = ?, updated_at = ? WHERE id = ?`, template.Title, template.Body, mustJSON(template.Tags), template.Position, nowString(), id)
	if err != nil {
		return PromptTemplate{}, err
	}
	return s.GetPromptTemplate(ctx, id)
}

func (s *Storage) ArchivePromptTemplate(ctx context.Context, id string) (PromptTemplate, error) {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `UPDATE prompt_templates SET archived_at = ?, updated_at = ? WHERE id = ?`, now, now, id)
	if err != nil {
		return PromptTemplate{}, err
	}
	return s.GetPromptTemplate(ctx, id)
}

func (s *Storage) RecordPromptTemplateUse(ctx context.Context, id string) (PromptTemplate, error) {
	now := nowString()
	_, err := s.db.ExecContext(ctx, `UPDATE prompt_templates SET use_count = use_count + 1, last_used_at = ?, updated_at = ? WHERE id = ?`, now, now, id)
	if err != nil {
		return PromptTemplate{}, err
	}
	return s.GetPromptTemplate(ctx, id)
}

func scanPromptTemplate(scanner interface{ Scan(dest ...any) error }) (PromptTemplate, error) {
	var template PromptTemplate
	var tagsJSON, lastUsed, archived sql.NullString
	err := scanner.Scan(&template.ID, &template.WorkspaceID, &template.AgentID, &template.Title, &template.Body, &tagsJSON, &template.Position, &template.UseCount, &lastUsed, &template.CreatedAt, &template.UpdatedAt, &archived)
	if err != nil {
		return PromptTemplate{}, err
	}
	if tagsJSON.Valid && tagsJSON.String != "" {
		_ = json.Unmarshal([]byte(tagsJSON.String), &template.Tags)
	}
	if template.Tags == nil {
		template.Tags = []string{}
	}
	if lastUsed.Valid {
		template.LastUsedAt = &lastUsed.String
	}
	if archived.Valid {
		template.ArchivedAt = &archived.String
	}
	return template, nil
}

func normalizeTags(tags []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
	}
	return out
}
