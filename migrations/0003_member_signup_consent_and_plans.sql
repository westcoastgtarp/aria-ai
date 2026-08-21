PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  consent_version TEXT NOT NULL,
  accepted INTEGER NOT NULL CHECK (accepted IN (0,1)),
  accepted_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitation_id) REFERENCES member_invitations(id)
);
CREATE INDEX IF NOT EXISTS idx_member_consents_user ON member_consents(user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_consents_email ON member_consents(email, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_consents_invitation ON member_consents(invitation_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS member_plan_selections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('free','lifeline_weekly','lifeline_annual')),
  billing_interval TEXT CHECK (billing_interval IN ('weekly','annual') OR billing_interval IS NULL),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('active','payment_required','cancelled')),
  selected_at TEXT NOT NULL,
  activated_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_member_plan_user ON member_plan_selections(user_id, selected_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_plan_status ON member_plan_selections(status, selected_at DESC);
