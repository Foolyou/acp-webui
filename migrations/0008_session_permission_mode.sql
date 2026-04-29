ALTER TABLE sessions ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'manual';

UPDATE sessions
SET permission_mode = 'manual'
WHERE permission_mode IS NULL OR permission_mode = '';

CREATE INDEX IF NOT EXISTS idx_sessions_permission_mode
    ON sessions(permission_mode);
