CREATE TABLE IF NOT EXISTS live_support_typing (
  ticket_id TEXT PRIMARY KEY,
  staff_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_live_support_typing_expires
ON live_support_typing(expires_at);
