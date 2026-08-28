PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS communication_deliveries (
  id TEXT PRIMARY KEY,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('member','staff','care_contact')),
  recipient_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('medication_reminder','custom_reminder','lifeline','support','account')),
  source_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','voice')),
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','failed','retrying','cancelled')),
  provider TEXT,
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  last_attempt_at TEXT,
  next_attempt_at TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  failed_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_type, source_id, recipient_type, recipient_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_communication_deliveries_status_retry
  ON communication_deliveries(status, next_attempt_at, attempt_count);

CREATE INDEX IF NOT EXISTS idx_communication_deliveries_recipient
  ON communication_deliveries(recipient_type, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_deliveries_source
  ON communication_deliveries(source_type, source_id, created_at DESC);
