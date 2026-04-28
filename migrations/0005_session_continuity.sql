ALTER TABLE sessions ADD COLUMN external_session_id TEXT;
ALTER TABLE sessions ADD COLUMN continuation_state TEXT NOT NULL DEFAULT 'view_only';
ALTER TABLE sessions ADD COLUMN restore_failure_message TEXT;
ALTER TABLE sessions ADD COLUMN restore_started_at TEXT;
ALTER TABLE sessions ADD COLUMN restore_completed_at TEXT;

UPDATE sessions
SET external_session_id = acp_session_id
WHERE external_session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_external_session_id
    ON sessions(external_session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_continuation_state
    ON sessions(continuation_state);
