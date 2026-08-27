PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_custom_reminders (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','appointment','care','other')),
  notes TEXT,
  scheduled_date TEXT NOT NULL,
  scheduled_time_local TEXT NOT NULL,
  timezone TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','dismissed')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  completed_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_member_custom_reminders_member_date
  ON member_custom_reminders(member_user_id, scheduled_date, scheduled_time_local);

CREATE INDEX IF NOT EXISTS idx_member_custom_reminders_active
  ON member_custom_reminders(member_user_id, active, status);
