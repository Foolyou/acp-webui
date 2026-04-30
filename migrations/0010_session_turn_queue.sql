ALTER TABLE sessions ADD COLUMN active_turn_started_at TEXT;
ALTER TABLE sessions ADD COLUMN active_turn_status TEXT;
ALTER TABLE sessions ADD COLUMN active_turn_stop_requested_at TEXT;

CREATE TABLE IF NOT EXISTS queued_prompts (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    submitted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_queued_prompts_session_status_position
    ON queued_prompts(session_id, status, position, created_at);
