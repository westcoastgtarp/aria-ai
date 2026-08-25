PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lifeline_incidents (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','human_support_queued','in_progress','closed')),
  highest_risk_level TEXT NOT NULL CHECK (highest_risk_level IN ('concern','high','critical')),
  current_risk_level TEXT NOT NULL CHECK (current_risk_level IN ('concern','high','critical')),
  source TEXT NOT NULL DEFAULT 'lifeline_monitor',
  related_ticket_id TEXT,
  assigned_staff_user_id TEXT,
  started_at TEXT NOT NULL,
  last_signal_at TEXT NOT NULL,
  escalated_at TEXT,
  claimed_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (related_ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (assigned_staff_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_lifeline_incidents_member_status
  ON lifeline_incidents(member_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_lifeline_incidents_queue
  ON lifeline_incidents(status, highest_risk_level, updated_at DESC);

CREATE TABLE IF NOT EXISTS lifeline_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN ('normal','concern','high','critical')),
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system','member','staff')),
  actor_user_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES lifeline_incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_lifeline_events_incident_time
  ON lifeline_events(incident_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS idx_lifeline_events_member_time
  ON lifeline_events(member_user_id, occurred_at DESC);
