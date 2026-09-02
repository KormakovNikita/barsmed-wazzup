import { getDb } from "@/lib/db";
import {
  deleteTemplateMediaFile,
  saveTemplateMediaBuffer,
  templateAttachmentPublicUrl,
} from "@/lib/template-media";
import type { MessageMediaType } from "@/lib/types";

export interface TemplateAttachment {
  id: string;
  templateId: string;
  type: MessageMediaType;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  url: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  attachments: TemplateAttachment[];
}

interface TemplateRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface TemplateAttachmentRow {
  id: string;
  template_id: string;
  type: string;
  mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  storage_path: string;
  created_at: string;
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

function rowToAttachment(row: TemplateAttachmentRow): TemplateAttachment {
  return {
    id: row.id,
    templateId: row.template_id,
    type: row.type as MessageMediaType,
    mimeType: row.mime_type ?? undefined,
    fileName: row.file_name ?? undefined,
    fileSize: row.file_size ?? undefined,
    url: templateAttachmentPublicUrl(row.id),
  };
}

function rowToTemplate(
  row: TemplateRow,
  attachments: TemplateAttachment[] = [],
): MessageTemplate {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments,
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

    CREATE TABLE IF NOT EXISTS message_template_attachments (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      type TEXT NOT NULL,
      mime_type TEXT,
      file_name TEXT,
      file_size INTEGER,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_template_attachments_template
      ON message_template_attachments(template_id);
  `);
}

function loadAttachmentsForTemplates(
  templateIds: string[],
): Map<string, TemplateAttachment[]> {
  if (templateIds.length === 0) return new Map();

  const placeholders = templateIds.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT * FROM message_template_attachments
       WHERE template_id IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .all(...templateIds) as TemplateAttachmentRow[];

  const map = new Map<string, TemplateAttachment[]>();
  for (const row of rows) {
    const list = map.get(row.template_id) ?? [];
    list.push(rowToAttachment(row));
    map.set(row.template_id, list);
  }
  return map;
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
  const attachments = loadAttachmentsForTemplates(rows.map((row) => row.id));
  return rows.map((row) => rowToTemplate(row, attachments.get(row.id) ?? []));
}

export function getMessageTemplate(id: string): MessageTemplate | null {
  seedDefaultTemplatesIfEmpty();
  const row = getDb()
    .prepare("SELECT * FROM message_templates WHERE id = ?")
    .get(id) as TemplateRow | undefined;
  if (!row) return null;
  const attachments = loadAttachmentsForTemplates([row.id]).get(row.id) ?? [];
  return rowToTemplate(row, attachments);
}

export function getTemplateAttachmentById(
  attachmentId: string,
): (TemplateAttachment & { storagePath: string }) | null {
  ensureTemplatesTable();
  const row = getDb()
    .prepare("SELECT * FROM message_template_attachments WHERE id = ?")
    .get(attachmentId) as TemplateAttachmentRow | undefined;
  if (!row) return null;
  return {
    ...rowToAttachment(row),
    storagePath: row.storage_path,
  };
}

export function addTemplateAttachment(
  templateId: string,
  input: {
    buffer: Buffer;
    mimeType: string;
    type: MessageMediaType;
    fileName?: string;
  },
): TemplateAttachment {
  seedDefaultTemplatesIfEmpty();
  const template = getMessageTemplate(templateId);
  if (!template) {
    throw new Error("Шаблон не найден");
  }

  const { attachmentId, storagePath } = saveTemplateMediaBuffer({
    templateId,
    buffer: input.buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO message_template_attachments
       (id, template_id, type, mime_type, file_name, file_size, storage_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      attachmentId,
      templateId,
      input.type,
      input.mimeType,
      input.fileName ?? null,
      input.buffer.length,
      storagePath,
      now,
    );

  getDb()
    .prepare("UPDATE message_templates SET updated_at = ? WHERE id = ?")
    .run(now, templateId);

  return {
    id: attachmentId,
    templateId,
    type: input.type,
    mimeType: input.mimeType,
    fileName: input.fileName,
    fileSize: input.buffer.length,
    url: templateAttachmentPublicUrl(attachmentId),
  };
}

export function removeTemplateAttachment(attachmentId: string): boolean {
  ensureTemplatesTable();
  const row = getDb()
    .prepare("SELECT * FROM message_template_attachments WHERE id = ?")
    .get(attachmentId) as TemplateAttachmentRow | undefined;
  if (!row) return false;

  deleteTemplateMediaFile(row.storage_path);
  getDb()
    .prepare("DELETE FROM message_template_attachments WHERE id = ?")
    .run(attachmentId);

  getDb()
    .prepare("UPDATE message_templates SET updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), row.template_id);

  return true;
}

function validateTemplateInput(input: {
  title: string;
  body: string;
  hasAttachments?: boolean;
}): { title: string; body: string } {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) {
    throw new Error("Название шаблона обязательно");
  }
  if (!body && !input.hasAttachments) {
    throw new Error("Добавьте текст шаблона или прикрепите файл");
  }
  return { title, body };
}

export function createMessageTemplate(input: {
  title: string;
  body: string;
  hasAttachments?: boolean;
}): MessageTemplate {
  seedDefaultTemplatesIfEmpty();
  const { title, body } = validateTemplateInput(input);

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
    attachments: [],
  };
}

export function updateMessageTemplate(
  id: string,
  input: { title: string; body: string; hasAttachments?: boolean },
): MessageTemplate | null {
  seedDefaultTemplatesIfEmpty();
  const existing = getMessageTemplate(id);
  if (!existing) return null;

  const { title, body } = validateTemplateInput({
    title: input.title,
    body: input.body,
    hasAttachments: input.hasAttachments ?? existing.attachments.length > 0,
  });

  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `UPDATE message_templates
       SET title = ?, body = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(title, body, now, id);

  if (result.changes === 0) return null;

  return getMessageTemplate(id);
}

export function deleteMessageTemplate(id: string): boolean {
  seedDefaultTemplatesIfEmpty();
  const attachments = loadAttachmentsForTemplates([id]).get(id) ?? [];
  for (const attachment of attachments) {
    const row = getDb()
      .prepare("SELECT storage_path FROM message_template_attachments WHERE id = ?")
      .get(attachment.id) as { storage_path: string } | undefined;
    if (row) deleteTemplateMediaFile(row.storage_path);
  }

  getDb()
    .prepare("DELETE FROM message_template_attachments WHERE template_id = ?")
    .run(id);

  const result = getDb()
    .prepare("DELETE FROM message_templates WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
