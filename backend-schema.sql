-- Aria AI backend foundation schema blueprint.
-- This file is not connected to production storage yet.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('member','staff')),
  status TEXT NOT NULL DEFAULT 'pending',
  password_hash TEXT,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE staff_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  department TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE member_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','used','expired','revoked')),
  issued_by_user_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  used_at TEXT,
  FOREIGN KEY (issued_by_user_id) REFERENCES users(id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  subject_type TEXT,
  subject_id TEXT,
  room_or_zone TEXT,
  asset_id TEXT,
  badge_id TEXT,
  related_ticket_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE audit_escalations (
  id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL,
  assigned_hr_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  closed_at TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (assigned_hr_user_id) REFERENCES users(id)
);

CREATE TABLE audit_escalation_events (
  escalation_id TEXT NOT NULL,
  audit_event_id TEXT NOT NULL,
  PRIMARY KEY (escalation_id, audit_event_id),
  FOREIGN KEY (escalation_id) REFERENCES audit_escalations(id),
  FOREIGN KEY (audit_event_id) REFERENCES audit_events(id)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'Normal',
  status TEXT NOT NULL DEFAULT 'Open',
  progress INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  assigned_to_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
);

CREATE TABLE ticket_notes (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);
