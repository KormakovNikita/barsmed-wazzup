import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_initials TEXT NOT NULL,
  online INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  deal_stage TEXT NOT NULL,
  notes TEXT,
  channel_user_ids TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_thread_id TEXT,
  assigned_to TEXT,
  auto_assigned INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_preview TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_channel_thread
  ON conversations(channel, external_thread_id)
  WHERE external_thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  content TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  operator_id TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external
  ON messages(conversation_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS processed_external_ids (
  channel TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  PRIMARY KEY (channel, external_message_id)
);

CREATE TABLE IF NOT EXISTS max_known_chats (
  chat_id TEXT PRIMARY KEY,
  user_id TEXT,
  contact_name TEXT,
  source TEXT NOT NULL DEFAULT 'event',
  discovered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message
  ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.join(process.cwd(), ".data");
    fs.mkdirSync(dir, { recursive: true });
    const dbPath =
      process.env.DATABASE_PATH ?? path.join(dir, "hubdesk.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
  }
  return db;
}

export function isDatabaseEmpty(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM conversations")
    .get() as { count: number };
  return row.count === 0;
}
