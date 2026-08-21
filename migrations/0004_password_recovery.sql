PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  used_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  request_ip_hash TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user
  ON password_reset_codes(user_id, used_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_password_reset_created
  ON password_reset_codes(user_id, created_at DESC);
