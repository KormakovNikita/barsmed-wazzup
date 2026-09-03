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
  channel_user_ids TEXT,
  client_status TEXT,
  is_vip INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_thread_id TEXT,
  assigned_to TEXT,
  auto_assigned INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  awaiting_reply INTEGER NOT NULL DEFAULT 0,
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
  reply_to_message_id TEXT,
  created_at TEXT NOT NULL,
  previous_content TEXT,
  edited_at TEXT
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

function registerDbFunctions(database: Database.Database): void {
  database.function(
    "unicode_lower",
    { deterministic: true, varargs: false },
    (value: unknown) => {
      if (value == null) return null;
      return String(value).toLowerCase();
    },
  );
}

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.join(process.cwd(), ".data");
    fs.mkdirSync(dir, { recursive: true });
    const dbPath =
      process.env.DATABASE_PATH ?? path.join(dir, "hubdesk.db");
    db = new Database(dbPath);
    registerDbFunctions(db);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    migrateSchema(db);
  }
  return db;
}

function migrateSchema(database: Database.Database): void {
  const messageColumns = database
    .prepare("PRAGMA table_info(messages)")
    .all() as { name: string }[];
  const messageNames = new Set(messageColumns.map((column) => column.name));
  if (!messageNames.has("reply_to_message_id")) {
    database.exec(
      "ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT",
    );
  }
  if (!messageNames.has("previous_content")) {
    database.exec("ALTER TABLE messages ADD COLUMN previous_content TEXT");
  }
  if (!messageNames.has("edited_at")) {
    database.exec("ALTER TABLE messages ADD COLUMN edited_at TEXT");
  }

  const conversationColumns = database
    .prepare("PRAGMA table_info(conversations)")
    .all() as { name: string }[];
  const conversationNames = new Set(
    conversationColumns.map((column) => column.name),
  );
  if (!conversationNames.has("awaiting_reply")) {
    database.exec(
      "ALTER TABLE conversations ADD COLUMN awaiting_reply INTEGER NOT NULL DEFAULT 0",
    );
    database.exec(`
      UPDATE conversations
      SET awaiting_reply = 1
      WHERE id IN (
        SELECT m.conversation_id
        FROM messages m
        INNER JOIN (
          SELECT conversation_id, MAX(created_at) AS max_created
          FROM messages
          GROUP BY conversation_id
        ) latest
          ON m.conversation_id = latest.conversation_id
         AND m.created_at = latest.max_created
        WHERE m.direction = 'in'
      )
    `);
    database.exec(`
      UPDATE conversations
      SET unread_count = 1
      WHERE awaiting_reply = 1 AND unread_count = 0
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_awaiting
        ON conversations(awaiting_reply DESC, updated_at DESC)
    `);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_thread_aliases (
      alias_thread_id TEXT PRIMARY KEY,
      canonical_thread_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_thread_aliases_canonical
      ON whatsapp_thread_aliases(canonical_thread_id);
  `);

  const contactColumns = database
    .prepare("PRAGMA table_info(contacts)")
    .all() as { name: string }[];
  const contactNames = new Set(contactColumns.map((column) => column.name));
  if (!contactNames.has("client_status")) {
    database.exec("ALTER TABLE contacts ADD COLUMN client_status TEXT");
  }
  if (!contactNames.has("is_vip")) {
    database.exec(
      "ALTER TABLE contacts ADD COLUMN is_vip INTEGER NOT NULL DEFAULT 0",
    );
  }
}

export function isDatabaseEmpty(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM conversations")
    .get() as { count: number };
  return row.count === 0;
}
