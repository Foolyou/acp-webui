ALTER TABLE sessions ADD COLUMN config_options_json TEXT;
ALTER TABLE sessions ADD COLUMN current_model_config_id TEXT;
ALTER TABLE sessions ADD COLUMN current_model_value TEXT;
ALTER TABLE sessions ADD COLUMN current_model_name TEXT;

