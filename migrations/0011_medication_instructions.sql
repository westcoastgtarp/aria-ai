PRAGMA foreign_keys = ON;

ALTER TABLE member_medications ADD COLUMN strength_text TEXT;
ALTER TABLE member_medications ADD COLUMN amount_text TEXT;
ALTER TABLE member_medications ADD COLUMN frequency_text TEXT;
ALTER TABLE member_medications ADD COLUMN timing_text TEXT;
ALTER TABLE member_medications ADD COLUMN as_needed INTEGER NOT NULL DEFAULT 0 CHECK (as_needed IN (0,1));
