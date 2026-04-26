CREATE TABLE IF NOT EXISTS permission_requests (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    acp_session_id TEXT NOT NULL,
    acp_request_id TEXT NOT NULL,
    tool_call_id TEXT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    selected_option_id TEXT,
    tool_call_json TEXT NOT NULL,
    options_json TEXT NOT NULL,
    failure_message TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_permission_requests_session_status
    ON permission_requests(session_id, status);

CREATE INDEX IF NOT EXISTS idx_permission_requests_status_created
    ON permission_requests(status, created_at);
