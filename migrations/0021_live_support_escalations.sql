CREATE TABLE IF NOT EXISTS live_support_escalations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  escalated_by_user_id TEXT NOT NULL,
  target_role TEXT NOT NULL CHECK (target_role IN ('Lead Supervisor','Supervisor','Founder')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id TEXT,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (escalated_by_user_id) REFERENCES users(id),
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_live_support_escalations_ticket
  ON live_support_escalations(ticket_id, status, created_at);
