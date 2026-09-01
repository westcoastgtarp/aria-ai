PRAGMA foreign_keys = ON;

ALTER TABLE care_circle_contacts ADD COLUMN share_support_event INTEGER NOT NULL DEFAULT 1 CHECK (share_support_event IN (0,1));
ALTER TABLE care_circle_contacts ADD COLUMN share_limited_status INTEGER NOT NULL DEFAULT 1 CHECK (share_limited_status IN (0,1));
ALTER TABLE care_circle_contacts ADD COLUMN share_location INTEGER NOT NULL DEFAULT 0 CHECK (share_location IN (0,1));
ALTER TABLE care_circle_contacts ADD COLUMN share_medication_summary INTEGER NOT NULL DEFAULT 0 CHECK (share_medication_summary IN (0,1));
ALTER TABLE care_circle_contacts ADD COLUMN share_chat_transcript INTEGER NOT NULL DEFAULT 0 CHECK (share_chat_transcript IN (0,1));
ALTER TABLE care_circle_contacts ADD COLUMN consent_scope_version TEXT NOT NULL DEFAULT '2026-09-01';
ALTER TABLE care_circle_contacts ADD COLUMN consent_granted_at TEXT;
ALTER TABLE care_circle_contacts ADD COLUMN consent_updated_at TEXT;
ALTER TABLE care_circle_contacts ADD COLUMN consent_revoked_at TEXT;

UPDATE care_circle_contacts
SET consent_granted_at = COALESCE(consent_granted_at, created_at),
    consent_updated_at = COALESCE(consent_updated_at, updated_at)
WHERE consent_confirmed = 1;
