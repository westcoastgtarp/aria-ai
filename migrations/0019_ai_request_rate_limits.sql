CREATE TABLE IF NOT EXISTS ai_request_rate_limits (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, scope, window_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_request_rate_limits_updated
  ON ai_request_rate_limits(updated_at);
