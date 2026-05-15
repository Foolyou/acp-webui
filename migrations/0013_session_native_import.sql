ALTER TABLE sessions ADD COLUMN title TEXT;
ALTER TABLE sessions ADD COLUMN native_title TEXT;
ALTER TABLE sessions ADD COLUMN native_updated_at TEXT;
ALTER TABLE sessions ADD COLUMN import_source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE sessions ADD COLUMN imported_at TEXT;

UPDATE sessions
SET import_source = 'local'
WHERE import_source IS NULL OR import_source = '';

CREATE INDEX IF NOT EXISTS idx_sessions_import_source
    ON sessions(import_source);

CREATE INDEX IF NOT EXISTS idx_sessions_native_updated_at
    ON sessions(native_updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_agent_external_session_id
    ON sessions(agent_id, external_session_id)
    WHERE external_session_id IS NOT NULL AND external_session_id <> '';
