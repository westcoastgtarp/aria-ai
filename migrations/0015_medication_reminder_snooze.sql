PRAGMA foreign_keys = ON;

ALTER TABLE medication_reminder_events ADD COLUMN snoozed_until TEXT;
ALTER TABLE medication_reminder_events ADD COLUMN snoozed_at TEXT;
ALTER TABLE medication_reminder_events ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_medication_reminder_events_snoozed_until
  ON medication_reminder_events(member_user_id, status, snoozed_until);
