CREATE TABLE IF NOT EXISTS review_artifacts (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tool_call_id TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_artifacts_session_created
    ON review_artifacts(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_review_artifacts_session_tool_call
    ON review_artifacts(session_id, tool_call_id);
