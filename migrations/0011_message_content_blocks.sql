ALTER TABLE messages ADD COLUMN content_blocks_json TEXT;
ALTER TABLE queued_prompts ADD COLUMN content_blocks_json TEXT;
