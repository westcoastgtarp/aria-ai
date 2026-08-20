PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff_account_invitations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','used','expired','revoked')),
  issued_by_user_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (issued_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_staff_account_invites_user
  ON staff_account_invitations(user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_staff_account_invites_status
  ON staff_account_invitations(status, expires_at);
