PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_medications (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dose_text TEXT NOT NULL,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_member_medications_member_active
  ON member_medications(member_user_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS medication_schedules (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  time_local TEXT NOT NULL,
  days_of_week TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
  timezone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (medication_id) REFERENCES member_medications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_medication_schedules_member_active
  ON medication_schedules(member_user_id, active, time_local);

CREATE INDEX IF NOT EXISTS idx_medication_schedules_medication
  ON medication_schedules(medication_id, active, time_local);

CREATE TABLE IF NOT EXISTS medication_dose_records (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_time_local TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'member' CHECK (source IN ('member')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (medication_id) REFERENCES member_medications(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES medication_schedules(id) ON DELETE CASCADE,
  UNIQUE (member_user_id, schedule_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_medication_dose_records_member_date
  ON medication_dose_records(member_user_id, scheduled_date, scheduled_time_local);

CREATE INDEX IF NOT EXISTS idx_medication_dose_records_schedule_date
  ON medication_dose_records(schedule_id, scheduled_date);
