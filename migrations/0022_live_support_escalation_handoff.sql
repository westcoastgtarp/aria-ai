ALTER TABLE live_support_escalations ADD COLUMN target_user_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_live_support_escalations_target_user
  ON live_support_escalations(target_user_id, status, created_at);
