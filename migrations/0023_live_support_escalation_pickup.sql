ALTER TABLE live_support_escalations ADD COLUMN picked_up_by_user_id TEXT REFERENCES users(id);
ALTER TABLE live_support_escalations ADD COLUMN picked_up_at TEXT;

CREATE INDEX IF NOT EXISTS idx_live_support_escalations_pickup
  ON live_support_escalations(ticket_id, status, picked_up_at);
