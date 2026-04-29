ALTER TABLE sessions ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'codex';

UPDATE sessions
SET agent_id = 'codex'
WHERE agent_id IS NULL OR agent_id = '';

UPDATE sessions
SET agent_name = 'Codex'
WHERE agent_id = 'codex' AND LOWER(agent_name) = 'codex';

CREATE INDEX IF NOT EXISTS idx_sessions_agent_id
    ON sessions(agent_id);
