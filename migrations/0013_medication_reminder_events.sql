PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS medication_reminder_events (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_time_local TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','acknowledged','dismissed','expired')),
  generated_at TEXT NOT NULL,
  acknowledged_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (medication_id) REFERENCES member_medications(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES medication_schedules(id) ON DELETE CASCADE,
  UNIQUE (member_user_id, schedule_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_medication_reminder_events_member_status
  ON medication_reminder_events(member_user_id, status, scheduled_date DESC, scheduled_time_local DESC);

CREATE INDEX IF NOT EXISTS idx_medication_reminder_events_schedule_date
  ON medication_reminder_events(schedule_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_medication_reminder_events_generated
  ON medication_reminder_events(generated_at DESC);
