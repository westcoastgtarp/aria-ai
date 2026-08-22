PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  city TEXT,
  state TEXT,
  department TEXT NOT NULL,
  desired_role TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  availability TEXT,
  experience_summary TEXT,
  why_aria TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','accepted','rejected','archived')),
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  candidate_id TEXT,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id),
  FOREIGN KEY (candidate_id) REFERENCES hiring_candidates(id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_status
  ON job_applications(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_email
  ON job_applications(email, submitted_at DESC);
