ALTER TABLE sessions ADD COLUMN launch_profile_id TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE sessions ADD COLUMN launch_profile_key TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE sessions ADD COLUMN launch_control_summary_json TEXT NOT NULL DEFAULT '[]';

UPDATE sessions
SET launch_profile_id = permission_mode,
    launch_profile_key = permission_mode,
    launch_control_summary_json = json_array(
        json_object(
            'id', 'permission',
            'label', 'Permission',
            'value', permission_mode,
            'valueLabel',
                CASE permission_mode
                    WHEN 'full_auto' THEN 'Full auto'
                    WHEN 'yolo' THEN 'YOLO'
                    ELSE 'Manual'
                END,
            'category', 'permission',
            'scope', 'launch',
            'riskLevel',
                CASE permission_mode
                    WHEN 'full_auto' THEN 'medium'
                    WHEN 'yolo' THEN 'high'
                    ELSE 'low'
                END
        )
    )
WHERE launch_profile_id IS NULL OR launch_profile_id = '';

CREATE INDEX IF NOT EXISTS idx_sessions_launch_profile
    ON sessions(agent_id, launch_profile_key);
