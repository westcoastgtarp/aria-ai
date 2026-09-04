CREATE TABLE IF NOT EXISTS responder_disclosures (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  related_ticket_id TEXT NOT NULL,
  related_incident_id TEXT,
  responder_name TEXT NOT NULL,
  responder_agency TEXT NOT NULL,
  responder_role TEXT NOT NULL,
  credential_reference TEXT,
  callback_number TEXT,
  verification_method TEXT NOT NULL,
  verification_notes TEXT NOT NULL,
  disclosure_reason TEXT NOT NULL,
  disclosed_fields_json TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (related_ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (related_incident_id) REFERENCES lifeline_incidents(id),
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_responder_disclosures_member
  ON responder_disclosures(member_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_responder_disclosures_ticket
  ON responder_disclosures(related_ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_responder_disclosures_staff
  ON responder_disclosures(recorded_by_user_id, created_at DESC);
