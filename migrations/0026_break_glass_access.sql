PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS break_glass_access_grants (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  related_ticket_id TEXT,
  related_incident_id TEXT,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by_user_id TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','reviewed')),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id),
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (related_ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (related_incident_id) REFERENCES lifeline_incidents(id),
  FOREIGN KEY (revoked_by_user_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_break_glass_actor_active
  ON break_glass_access_grants(actor_user_id, member_user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_break_glass_review
  ON break_glass_access_grants(review_status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_break_glass_member
  ON break_glass_access_grants(member_user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS break_glass_access_events (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (grant_id) REFERENCES break_glass_access_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_break_glass_events_grant
  ON break_glass_access_events(grant_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS idx_break_glass_events_actor
  ON break_glass_access_events(actor_user_id, occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS prevent_break_glass_event_update
BEFORE UPDATE ON break_glass_access_events
BEGIN
  SELECT RAISE(ABORT, 'Break Glass event ledger is immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_break_glass_event_delete
BEFORE DELETE ON break_glass_access_events
BEGIN
  SELECT RAISE(ABORT, 'Break Glass event ledger is immutable');
END;
