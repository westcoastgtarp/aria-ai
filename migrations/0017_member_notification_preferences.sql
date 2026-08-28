PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_notification_preferences (
  member_user_id TEXT PRIMARY KEY,
  email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0,1)),
  sms_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sms_enabled IN (0,1)),
  sms_phone_e164 TEXT,
  private_content INTEGER NOT NULL DEFAULT 1 CHECK (private_content IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_notification_preferences_sms
  ON member_notification_preferences(sms_enabled, sms_phone_e164);
