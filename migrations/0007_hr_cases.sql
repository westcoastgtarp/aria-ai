PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hr_cases (
  id TEXT PRIMARY KEY,
  employee_user_id TEXT NOT NULL,
  case_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal','High','Urgent')),
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Closed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  opened_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  FOREIGN KEY (employee_user_id) REFERENCES users(id),
  FOREIGN KEY (opened_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_cases_status
  ON hr_cases(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_cases_employee
  ON hr_cases(employee_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS hr_case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES hr_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_case_notes_case
  ON hr_case_notes(case_id, created_at ASC);
