PRAGMA foreign_keys = ON;

ALTER TABLE member_conversation_messages
ADD COLUMN staff_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_member_conversation_messages_staff_user
ON member_conversation_messages(staff_user_id, created_at DESC);
