PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hiring_candidates (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  department TEXT,
  expected_role TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','submitted','reviewed','archived')),
  onboarding_token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL,
  invited_at TEXT NOT NULL,
  onboarding_expires_at TEXT NOT NULL,
  submitted_at TEXT,
  reviewed_at TEXT,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_hiring_candidates_status
  ON hiring_candidates(status, invited_at DESC);
CREATE INDEX IF NOT EXISTS idx_hiring_candidates_email
  ON hiring_candidates(email, status);

CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  preferred_name TEXT,
  personal_email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  department TEXT NOT NULL,
  expected_role TEXT NOT NULL,
  preferred_start_date TEXT NOT NULL,
  availability TEXT NOT NULL,
  emergency_contact TEXT,
  notes TEXT,
  accuracy_ack INTEGER NOT NULL CHECK (accuracy_ack IN (0,1)),
  policy_ack INTEGER NOT NULL CHECK (policy_ack IN (0,1)),
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES hiring_candidates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_candidate
  ON onboarding_submissions(candidate_id, submitted_at DESC);
