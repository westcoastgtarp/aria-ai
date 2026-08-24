PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS care_circle_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 10),
  consent_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (consent_confirmed IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_care_circle_user_status
  ON care_circle_contacts(user_id, status, priority, created_at);
