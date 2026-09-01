import { getDb } from "@/lib/db";

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_TEMPLATES: Array<{ title: string; body: string }> = [
  {
    title: "Подтверждение записи",
    body:
      "Добрый день, {имя}! Запись подтверждена на {дата} в {время}. Адрес: {адрес}. Если планы изменятся — напишите нам.",
  },
  {
    title: "Уточнение города",
    body:
      "Здравствуйте, {имя}! Подскажите, пожалуйста, в каком городе вам удобнее пройти обследование?",
  },
  {
    title: "Напоминание о приёме",
    body:
      "Напоминаем о приёме {дата} в {время}. Пожалуйста, возьмите с собой паспорт и направление врача.",
  },
  {
    title: "Запрос контактов",
    body:
      "Для оформления записи уточните, пожалуйста, ваш номер телефона и удобное время для звонка.",
  },
];

function rowToTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureTemplatesTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_message_templates_updated
      ON message_templates(updated_at DESC);
  `);
}

function seedDefaultTemplatesIfEmpty(): void {
  ensureTemplatesTable();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM message_templates")
    .get() as { count: number };
  if (row.count > 0) return;

  const now = new Date().toISOString();
  const insert = getDb().prepare(
    `INSERT INTO message_templates (id, title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const template of DEFAULT_TEMPLATES) {
    insert.run(
      `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      template.title,
      template.body,
      now,
      now,
    );
  }
}

export function listMessageTemplates(): MessageTemplate[] {
  seedDefaultTemplatesIfEmpty();
  const rows = getDb()
    .prepare(
      "SELECT * FROM message_templates ORDER BY updated_at DESC, title ASC",
    )
    .all() as TemplateRow[];
  return rows.map(rowToTemplate);
}

export function createMessageTemplate(input: {
  title: string;
  body: string;
}): MessageTemplate {
  seedDefaultTemplatesIfEmpty();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) {
    throw new Error("Название и текст шаблона обязательны");
  }

  const now = new Date().toISOString();
  const id = `tpl-${Date.now()}`;
  getDb()
    .prepare(
      `INSERT INTO message_templates (id, title, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, title, body, now, now);

  return {
    id,
    title,
    body,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateMessageTemplate(
  id: string,
  input: { title: string; body: string },
): MessageTemplate | null {
  seedDefaultTemplatesIfEmpty();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) {
    throw new Error("Название и текст шаблона обязательны");
  }

  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `UPDATE message_templates
       SET title = ?, body = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(title, body, now, id);

  if (result.changes === 0) return null;

  const row = getDb()
    .prepare("SELECT * FROM message_templates WHERE id = ?")
    .get(id) as TemplateRow | undefined;
  return row ? rowToTemplate(row) : null;
}

export function deleteMessageTemplate(id: string): boolean {
  seedDefaultTemplatesIfEmpty();
  const result = getDb()
    .prepare("DELETE FROM message_templates WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
