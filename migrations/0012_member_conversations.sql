PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_conversations (
  id TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_conversations_member_recent
  ON member_conversations(member_user_id,last_message_at DESC);

CREATE TABLE IF NOT EXISTS member_conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member','assistant','staff','system')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'member' CHECK (source IN ('member','assistant_model','assistant_deterministic','staff','system')),
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN ('normal','concern','high','critical')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES member_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_conversation_messages_thread
  ON member_conversation_messages(conversation_id,created_at ASC);

CREATE INDEX IF NOT EXISTS idx_member_conversation_messages_member_recent
  ON member_conversation_messages(member_user_id,created_at DESC);
