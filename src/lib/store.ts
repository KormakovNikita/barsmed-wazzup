import { getDb, isDatabaseEmpty } from "@/lib/db";
import { ALL_CHANNELS, CHANNEL_CONFIG } from "@/lib/channels";
import { getAssignmentStrategy, pickOperatorForAssignment } from "@/lib/assignment";
import { dispatchOutboundMessage, deleteChannelMessage, editChannelMessage } from "@/lib/integrations";
import { getMaxIncomingMode, getPublicAppBaseUrl } from "@/lib/integrations/wazzup-max";
import {
  deleteMediaFile,
  mediaPreviewLabel,
  saveMediaBuffer,
  toMessageAttachment,
} from "@/lib/media-storage";
import type {
  Channel,
  Contact,
  Conversation,
  ConversationDetail,
  DealStage,
  IncomingAttachmentPayload,
  IncomingMessagePayload,
  Message,
  MessageAttachment,
  MessageMediaType,
  Operator,
  OutboundAttachmentPayload,
} from "@/lib/types";
import { isWhatsAppLidIdentifier, isWhatsAppPhoneIdentifier } from "@/lib/integrations/whatsapp/phone";

type ContactRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string;
  deal_stage: DealStage;
  notes: string | null;
  channel_user_ids: string | null;
};

type ConversationRow = {
  id: string;
  contact_id: string;
  channel: Channel;
  external_thread_id: string | null;
  assigned_to: string | null;
  auto_assigned: number;
  unread_count: number;
  awaiting_reply: number;
  last_message_preview: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  content: string;
  direction: "in" | "out";
  status: Message["status"];
  operator_id: string | null;
  external_id: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  previous_content: string | null;
  edited_at: string | null;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  type: MessageMediaType;
  mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  storage_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
};

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    company: row.company ?? undefined,
    tags: JSON.parse(row.tags) as string[],
    dealStage: row.deal_stage,
    notes: row.notes ?? undefined,
    channelUserIds: row.channel_user_ids
      ? (JSON.parse(row.channel_user_ids) as Partial<Record<Channel, string>>)
      : undefined,
  };
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    contactId: row.contact_id,
    channel: row.channel,
    externalThreadId: row.external_thread_id ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    autoAssigned: row.auto_assigned === 1,
    awaitingReply: row.awaiting_reply === 1,
    unreadCount: row.unread_count,
    lastMessagePreview: row.last_message_preview,
    updatedAt: row.updated_at,
  };
}

function bottomConversationSortTimestamp(): string {
  const row = getDb()
    .prepare(
      "SELECT MIN(updated_at) AS min_updated FROM conversations WHERE awaiting_reply = 0",
    )
    .get() as { min_updated: string | null };

  if (!row.min_updated) {
    return new Date(0).toISOString();
  }

  return new Date(new Date(row.min_updated).getTime() - 1000).toISOString();
}

function syncAwaitingReplyFromLastMessage(conversationId: string): void {
  const lastInbound = getDb()
    .prepare(
      `SELECT created_at FROM messages
       WHERE conversation_id = ? AND direction = 'in'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(conversationId) as { created_at: string } | undefined;

  const lastOperatorReply = getDb()
    .prepare(
      `SELECT created_at FROM messages
       WHERE conversation_id = ? AND direction = 'out' AND operator_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(conversationId) as { created_at: string } | undefined;

  const needsReply =
    lastInbound != null &&
    (lastOperatorReply == null ||
      lastInbound.created_at > lastOperatorReply.created_at);

  if (needsReply) {
    getDb()
      .prepare(
        `UPDATE conversations
         SET awaiting_reply = 1,
             unread_count = CASE WHEN unread_count = 0 THEN 1 ELSE unread_count END
         WHERE id = ?`,
      )
      .run(conversationId);
  } else {
    getDb()
      .prepare("UPDATE conversations SET awaiting_reply = 0 WHERE id = ?")
      .run(conversationId);
  }
}

export function reconcileAllConversationReplyStates(): number {
  const rows = getDb()
    .prepare("SELECT id FROM conversations")
    .all() as { id: string }[];
  for (const row of rows) {
    syncAwaitingReplyFromLastMessage(row.id);
  }
  return rows.length;
}

function rowToAttachment(row: AttachmentRow): MessageAttachment {
  return toMessageAttachment({
    id: row.id,
    messageId: row.message_id,
    type: row.type,
    mimeType: row.mime_type ?? "application/octet-stream",
    fileName: row.file_name ?? undefined,
    fileSize: row.file_size ?? undefined,
    storagePath: row.storage_path,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
  });
}

function loadAttachmentsForMessages(messageIds: string[]): Map<string, MessageAttachment[]> {
  const map = new Map<string, MessageAttachment[]>();
  if (!messageIds.length) return map;

  const placeholders = messageIds.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT * FROM message_attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...messageIds) as AttachmentRow[];

  for (const row of rows) {
    const list = map.get(row.message_id) ?? [];
    list.push(rowToAttachment(row));
    map.set(row.message_id, list);
  }
  return map;
}

function insertAttachmentsForMessage(
  messageId: string,
  conversationId: string,
  attachments: IncomingAttachmentPayload[] | OutboundAttachmentPayload[],
): MessageAttachment[] {
  const saved: MessageAttachment[] = [];
  for (const attachment of attachments) {
    const { attachmentId, storagePath } = saveMediaBuffer({
      conversationId,
      buffer: attachment.buffer,
      mimeType: attachment.mimeType,
      type: attachment.type,
      fileName: attachment.fileName,
    });

    getDb()
      .prepare(
        `INSERT INTO message_attachments (
           id, message_id, type, mime_type, file_name, file_size, storage_path, width, height, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        attachmentId,
        messageId,
        attachment.type,
        attachment.mimeType,
        attachment.fileName ?? null,
        ("fileSize" in attachment ? attachment.fileSize : undefined) ??
          attachment.buffer.length,
        storagePath,
        "width" in attachment ? attachment.width ?? null : null,
        "height" in attachment ? attachment.height ?? null : null,
        new Date().toISOString(),
      );

    saved.push(
      toMessageAttachment({
        id: attachmentId,
        messageId,
        type: attachment.type,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        fileSize:
          ("fileSize" in attachment ? attachment.fileSize : undefined) ??
          attachment.buffer.length,
        storagePath,
        width: "width" in attachment ? attachment.width : undefined,
        height: "height" in attachment ? attachment.height : undefined,
      }),
    );
  }
  return saved;
}

function messagePreviewText(content: string, attachments?: MessageAttachment[]): string {
  if (content.trim()) return content.trim();
  if (attachments?.length) {
    const first = attachments[0];
    return mediaPreviewLabel(first.type, first.fileName);
  }
  return "";
}

function rowToMessage(row: MessageRow, attachments?: MessageAttachment[]): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    content: row.content,
    direction: row.direction,
    status: row.status,
    operatorId: row.operator_id ?? undefined,
    externalId: row.external_id ?? undefined,
    replyToMessageId: row.reply_to_message_id ?? undefined,
    createdAt: row.created_at,
    previousContent: row.previous_content ?? undefined,
    editedAt: row.edited_at ?? undefined,
    attachments,
  };
}

function enrichMessagesWithReplies(messages: Message[]): Message[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return messages.map((message) => {
    if (!message.replyToMessageId) return message;
    const parent = byId.get(message.replyToMessageId);
    if (!parent) return message;
    return {
      ...message,
      replyTo: {
        messageId: parent.id,
        content: messagePreviewText(parent.content, parent.attachments),
        direction: parent.direction,
      },
    };
  });
}

function findMessageIdByChannelMessageId(
  conversationId: string,
  channelMessageId: string,
): string | undefined {
  const row = getDb()
    .prepare(
      `SELECT id FROM messages
       WHERE conversation_id = ?
         AND (external_id = ? OR external_id LIKE ? OR external_id LIKE ? OR external_id = ?)
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(
      conversationId,
      channelMessageId,
      `tg-user-${channelMessageId}-%`,
      `tg-bot-%${channelMessageId}`,
      `max-${channelMessageId}`,
    ) as { id: string } | undefined;
  return row?.id;
}

function findExistingMessageRow(
  conversationId: string,
  payload: IncomingMessagePayload,
): MessageRow | undefined {
  const db = getDb();
  const byExternalId = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? AND external_id = ? LIMIT 1",
    )
    .get(conversationId, payload.externalMessageId) as MessageRow | undefined;
  if (byExternalId) return byExternalId;

  if (payload.channelMessageId) {
    const byChannelId = db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ?
           AND (external_id = ? OR external_id = ? OR external_id LIKE ? OR external_id LIKE ? OR external_id = ?)
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(
        conversationId,
        payload.channelMessageId,
        `wa-${payload.channelMessageId}`,
        `tg-user-${payload.channelMessageId}-%`,
        `tg-bot-%${payload.channelMessageId}`,
        `max-${payload.channelMessageId}`,
      ) as MessageRow | undefined;
    if (byChannelId) return byChannelId;
  }

  const wazzupMatch = payload.externalMessageId.match(/^wazzup-(?:max-)?(.+)$/);
  if (wazzupMatch) {
    const messageKey = wazzupMatch[1];
    return db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ?
           AND external_id IN (?, ?, ?)
         LIMIT 1`,
      )
      .get(
        conversationId,
        payload.externalMessageId,
        `wazzup-${messageKey}`,
        `wazzup-max-${messageKey}`,
      ) as MessageRow | undefined;
  }

  const maxMid = payload.externalMessageId.replace(/^max-/, "");
  if (maxMid && maxMid !== payload.externalMessageId) {
    return db
      .prepare(
        "SELECT * FROM messages WHERE conversation_id = ? AND external_id = ? LIMIT 1",
      )
      .get(conversationId, maxMid) as MessageRow | undefined;
  }

  return undefined;
}

function repairMessageTimestamp(
  messageId: string,
  createdAt: string | undefined,
  existingCreatedAt: string,
): void {
  if (!createdAt) return;
  const existingMs = new Date(existingCreatedAt).getTime();
  const incomingMs = new Date(createdAt).getTime();
  if (!Number.isFinite(existingMs) || !Number.isFinite(incomingMs)) return;
  if (Math.abs(existingMs - incomingMs) < 60 * 60 * 1000) return;

  getDb()
    .prepare("UPDATE messages SET created_at = ? WHERE id = ?")
    .run(createdAt, messageId);
}

function isMediaPreviewContent(content: string): boolean {
  return /^[📷🎬🎵🎤📎🙂]/.test(content.trim());
}

function applyMessageEdit(
  existing: MessageRow,
  newContent: string,
  conversationId: string,
): Message | null {
  const trimmed = newContent.trim();
  if (!trimmed || trimmed === existing.content.trim()) {
    return null;
  }

  // Outbound echoes from channels must not overwrite operator message text.
  if (existing.direction === "out") {
    return null;
  }

  // Ignore channel echoes that only carry a media placeholder label.
  if (
    isMediaPreviewContent(trimmed) &&
    existing.content.trim() &&
    !isMediaPreviewContent(existing.content)
  ) {
    return null;
  }

  const editedAt = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE messages
       SET content = ?, previous_content = ?, edited_at = ?
       WHERE id = ?`,
    )
    .run(trimmed, existing.content, editedAt, existing.id);

  const latest = getDb()
    .prepare(
      "SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(conversationId) as { id: string } | undefined;

  if (latest?.id === existing.id) {
    getDb()
      .prepare(
        "UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?",
      )
      .run(trimmed, editedAt, conversationId);
  }

  const attachments = loadAttachmentsForMessages([existing.id]).get(existing.id);
  return rowToMessage(
    {
      ...existing,
      content: trimmed,
      previous_content: existing.content,
      edited_at: editedAt,
    },
    attachments,
  );
}

function resolveReplyToChannelMessageId(
  replyToMessageId: string | undefined,
): string | undefined {
  if (!replyToMessageId) return undefined;
  const row = getDb()
    .prepare("SELECT external_id FROM messages WHERE id = ?")
    .get(replyToMessageId) as { external_id: string | null } | undefined;
  if (!row?.external_id) return undefined;
  return extractChannelMessageId(row.external_id);
}

export function extractChannelMessageId(externalId: string): string | undefined {
  const tgMatch = externalId.match(/^tg-user-(\d+)-/);
  if (tgMatch) return tgMatch[1];
  if (externalId.startsWith("mid.")) return externalId;
  const maxMatch = externalId.match(/^max-(mid\.[a-zA-Z0-9._-]+)$/);
  if (maxMatch) return maxMatch[1];
  const wazzupMatch = externalId.match(/^wazzup-max-(.+)$/i);
  if (wazzupMatch) return wazzupMatch[1];
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      externalId,
    )
  ) {
    return externalId;
  }
  const vkMatch = externalId.match(/^vk-\d+-(\d+)$/);
  if (vkMatch) return vkMatch[1];
  return externalId;
}

export function backfillMissingMaxExternalIds(
  conversationId: string,
  items: Array<{
    externalId: string;
    content: string;
    direction: "in" | "out";
    createdAt: string;
  }>,
): number {
  const missing = getDb()
    .prepare(
      `SELECT id, content, direction, created_at
       FROM messages
       WHERE conversation_id = ?
         AND (external_id IS NULL OR external_id = '')`,
    )
    .all(conversationId) as Array<{
    id: string;
    content: string;
    direction: "in" | "out";
    created_at: string;
  }>;

  if (!missing.length) return 0;

  let updated = 0;
  const tx = getDb().transaction(() => {
    for (const message of missing) {
      const messageTime = new Date(message.created_at).getTime();
      const normalizedContent = message.content.trim();

      const match = items.find((item) => {
        if (item.direction !== message.direction) return false;
        if (!item.externalId.startsWith("mid.")) return false;
        const itemTime = new Date(item.createdAt).getTime();
        if (Math.abs(itemTime - messageTime) > 120_000) return false;
        if (normalizedContent && item.content.trim() === normalizedContent) {
          return true;
        }
        if (!normalizedContent && !item.content.trim()) return true;
        return false;
      });

      if (!match) continue;

      getDb()
        .prepare("UPDATE messages SET external_id = ? WHERE id = ?")
        .run(match.externalId, message.id);
      updated += 1;
    }
  });
  tx();

  return updated;
}

function upsertContact(contact: Contact): void {
  getDb()
    .prepare(
      `INSERT INTO contacts (id, name, phone, email, company, tags, deal_stage, notes, channel_user_ids)
       VALUES (@id, @name, @phone, @email, @company, @tags, @dealStage, @notes, @channelUserIds)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         email = excluded.email,
         company = excluded.company,
         tags = excluded.tags,
         deal_stage = excluded.deal_stage,
         notes = excluded.notes,
         channel_user_ids = excluded.channel_user_ids`,
    )
    .run({
      id: contact.id,
      name: contact.name,
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      company: contact.company ?? null,
      tags: JSON.stringify(contact.tags),
      dealStage: contact.dealStage,
      notes: contact.notes ?? null,
      channelUserIds: contact.channelUserIds
        ? JSON.stringify(contact.channelUserIds)
        : null,
    });
}

function upsertConversation(conversation: Conversation): void {
  getDb()
    .prepare(
      `INSERT INTO conversations (
         id, contact_id, channel, external_thread_id, assigned_to, auto_assigned,
         unread_count, awaiting_reply, last_message_preview, updated_at
       ) VALUES (
         @id, @contactId, @channel, @externalThreadId, @assignedTo, @autoAssigned,
         @unreadCount, @awaitingReply, @lastMessagePreview, @updatedAt
       )
       ON CONFLICT(id) DO UPDATE SET
         assigned_to = excluded.assigned_to,
         auto_assigned = excluded.auto_assigned,
         unread_count = excluded.unread_count,
         awaiting_reply = excluded.awaiting_reply,
         last_message_preview = excluded.last_message_preview,
         updated_at = excluded.updated_at`,
    )
    .run({
      id: conversation.id,
      contactId: conversation.contactId,
      channel: conversation.channel,
      externalThreadId: conversation.externalThreadId ?? null,
      assignedTo: conversation.assignedTo ?? null,
      autoAssigned: conversation.autoAssigned ? 1 : 0,
      unreadCount: conversation.unreadCount,
      awaitingReply: conversation.awaitingReply ? 1 : 0,
      lastMessagePreview: conversation.lastMessagePreview,
      updatedAt: conversation.updatedAt,
    });
}

function insertMessage(message: Message): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO messages (
         id, conversation_id, content, direction, status, operator_id, external_id, reply_to_message_id, created_at
       ) VALUES (
         @id, @conversationId, @content, @direction, @status, @operatorId, @externalId, @replyToMessageId, @createdAt
       )`,
    )
    .run({
      id: message.id,
      conversationId: message.conversationId,
      content: message.content,
      direction: message.direction,
      status: message.status,
      operatorId: message.operatorId ?? null,
      externalId: message.externalId ?? null,
      replyToMessageId: message.replyToMessageId ?? null,
      createdAt: message.createdAt,
    });
}

function updateMessage(message: Message): void {
  getDb()
    .prepare(
      `UPDATE messages SET status = @status, external_id = @externalId WHERE id = @id`,
    )
    .run({
      id: message.id,
      status: message.status,
      externalId: message.externalId ?? null,
    });
}

const MESSAGE_STATUS_RANK: Record<Message["status"], number> = {
  failed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export function updateWhatsAppMessageDeliveryStatus(
  channelMessageId: string,
  status: Message["status"],
): void {
  const row = getDb()
    .prepare(
      `SELECT m.id, m.status
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.channel = 'whatsapp'
         AND m.direction = 'out'
         AND (m.external_id = ? OR m.external_id = ?)
       LIMIT 1`,
    )
    .get(channelMessageId, `wa-${channelMessageId}`) as
    | { id: string; status: Message["status"] }
    | undefined;

  if (!row) return;

  const currentRank = MESSAGE_STATUS_RANK[row.status] ?? 0;
  const nextRank = MESSAGE_STATUS_RANK[status] ?? 0;
  if (nextRank <= currentRank) return;

  getDb()
    .prepare("UPDATE messages SET status = ? WHERE id = ?")
    .run(status, row.id);
}

function getContact(id: string): Contact | undefined {
  const row = getDb()
    .prepare("SELECT * FROM contacts WHERE id = ?")
    .get(id) as ContactRow | undefined;
  return row ? rowToContact(row) : undefined;
}

function getOperator(id: string): Operator | undefined {
  const row = getDb()
    .prepare("SELECT * FROM operators WHERE id = ?")
    .get(id) as Operator | undefined;
  return row;
}

function findConversationByExternalThread(
  channel: Channel,
  externalThreadId: string,
): Conversation | undefined {
  const row = getDb()
    .prepare(
      "SELECT * FROM conversations WHERE channel = ? AND external_thread_id = ?",
    )
    .get(channel, externalThreadId) as ConversationRow | undefined;
  return row ? rowToConversation(row) : undefined;
}

export function registerWhatsAppThreadAlias(
  lidThreadId: string,
  phoneThreadId: string,
): void {
  if (
    !lidThreadId ||
    !phoneThreadId ||
    lidThreadId === phoneThreadId ||
    !isWhatsAppLidIdentifier(lidThreadId) ||
    !isWhatsAppPhoneIdentifier(phoneThreadId)
  ) {
    return;
  }

  getDb()
    .prepare(
      `INSERT OR REPLACE INTO whatsapp_thread_aliases (alias_thread_id, canonical_thread_id)
       VALUES (?, ?)`,
    )
    .run(lidThreadId, phoneThreadId);

  mergeWhatsAppConversationThreads(lidThreadId, phoneThreadId);
}

export function getWhatsAppCanonicalThreadId(threadId: string): string {
  const row = getDb()
    .prepare(
      "SELECT canonical_thread_id FROM whatsapp_thread_aliases WHERE alias_thread_id = ?",
    )
    .get(threadId) as { canonical_thread_id: string } | undefined;
  return row?.canonical_thread_id ?? threadId;
}

function findWhatsAppConversation(threadId: string): Conversation | undefined {
  const canonical = getWhatsAppCanonicalThreadId(threadId);
  const candidates = [...new Set([canonical, threadId])];

  for (const id of candidates) {
    const conv = findConversationByExternalThread("whatsapp", id);
    if (!conv) continue;

    if (
      conv.externalThreadId &&
      conv.externalThreadId !== canonical &&
      isWhatsAppPhoneIdentifier(canonical)
    ) {
      try {
        getDb()
          .prepare(
            "UPDATE conversations SET external_thread_id = ? WHERE id = ?",
          )
          .run(canonical, conv.id);
        return { ...conv, externalThreadId: canonical };
      } catch {
        mergeWhatsAppConversationThreads(conv.externalThreadId, canonical);
        return findConversationByExternalThread("whatsapp", canonical);
      }
    }

    return conv;
  }

  return undefined;
}

export function isWhatsAppMessageAlreadyStored(
  channelMessageId: string,
): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS found FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.channel = 'whatsapp'
         AND (m.external_id = ? OR m.external_id = ?)
       LIMIT 1`,
    )
    .get(channelMessageId, `wa-${channelMessageId}`) as
    | { found: number }
    | undefined;

  if (row) return true;

  const processed = getDb()
    .prepare(
      `SELECT 1 AS found FROM processed_external_ids
       WHERE channel = 'whatsapp'
         AND (external_message_id = ? OR external_message_id = ?)
       LIMIT 1`,
    )
    .get(channelMessageId, `wa-${channelMessageId}`) as
    | { found: number }
    | undefined;

  return Boolean(processed);
}

function findContactByChannelUser(
  channel: Channel,
  externalUserId: string,
): Contact | undefined {
  const rows = getDb()
    .prepare("SELECT * FROM contacts WHERE channel_user_ids IS NOT NULL")
    .all() as ContactRow[];

  return rows
    .map(rowToContact)
    .find((c) => c.channelUserIds?.[channel] === externalUserId);
}

function autoAssignOperator(conversationId: string): string | null {
  const operator = pickOperatorForAssignment(
    listOperators(),
    listConversations(),
    getAssignmentStrategy(),
  );
  if (!operator) return null;

  getDb()
    .prepare(
      "UPDATE conversations SET assigned_to = ?, auto_assigned = 1 WHERE id = ?",
    )
    .run(operator.id, conversationId);

  return operator.id;
}

function findConversationByContactAndChannel(
  contactId: string,
  channel: Channel,
): Conversation | undefined {
  const row = getDb()
    .prepare(
      "SELECT * FROM conversations WHERE contact_id = ? AND channel = ? LIMIT 1",
    )
    .get(contactId, channel) as ConversationRow | undefined;
  return row ? rowToConversation(row) : undefined;
}

function findMaxConversation(
  chatId?: string,
  userId?: string,
): Conversation | undefined {
  if (chatId) {
    const byChat = findConversationByExternalThread("max", chatId);
    if (byChat) return byChat;
  }

  if (userId) {
    const byUser = findConversationByExternalThread("max", userId);
    if (byUser) return byUser;

    const contact = findContactByChannelUser("max", userId);
    if (contact) {
      return findConversationByContactAndChannel(contact.id, "max");
    }
  }

  return undefined;
}

function upgradeMaxConversationThread(
  conversationId: string,
  chatId: string,
  userId?: string,
  contactName?: string,
): void {
  getDb()
    .prepare("UPDATE conversations SET external_thread_id = ? WHERE id = ?")
    .run(chatId, conversationId);

  registerMaxKnownChat({
    chatId,
    userId,
    contactName,
    source: "merge",
  });
}

function createContactFromInbound(payload: IncomingMessagePayload): Contact {
  const maxUserId =
    payload.channel === "max"
      ? (payload.maxUserId ?? payload.externalThreadId)
      : payload.externalThreadId;

  const contact: Contact = {
    id: `c-${Date.now()}`,
    name: payload.senderName,
    tags: [payload.channel === "max" ? "MAX" : "Telegram"],
    dealStage: "new",
    channelUserIds: {
      [payload.channel]: maxUserId,
    },
    notes: payload.senderUsername ? `@${payload.senderUsername}` : undefined,
  };
  upsertContact(contact);
  return contact;
}

function createConversation(
  contactId: string,
  channel: Channel,
  externalThreadId: string,
  preview: string,
): Conversation {
  const conversation: Conversation = {
    id: `conv-${Date.now()}`,
    contactId,
    channel,
    externalThreadId,
    awaitingReply: false,
    unreadCount: 0,
    lastMessagePreview: preview,
    updatedAt: new Date().toISOString(),
  };
  upsertConversation(conversation);
  return conversation;
}

export function registerMaxKnownChat(input: {
  chatId: string;
  userId?: string;
  contactName?: string;
  source?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO max_known_chats (chat_id, user_id, contact_name, source, discovered_at)
       VALUES (@chatId, @userId, @contactName, @source, @discoveredAt)
       ON CONFLICT(chat_id) DO UPDATE SET
         user_id = COALESCE(excluded.user_id, max_known_chats.user_id),
         contact_name = COALESCE(excluded.contact_name, max_known_chats.contact_name),
         source = excluded.source`,
    )
    .run({
      chatId: input.chatId,
      userId: input.userId ?? null,
      contactName: input.contactName ?? null,
      source: input.source ?? "event",
      discoveredAt: new Date().toISOString(),
    });
}

export function listMaxKnownChatIds(): string[] {
  const rows = getDb()
    .prepare("SELECT chat_id FROM max_known_chats ORDER BY discovered_at DESC")
    .all() as { chat_id: string }[];
  return rows.map((row) => row.chat_id);
}

export function resolveMaxOutboundTargets(
  externalThreadId: string,
  contactId?: string,
): { chatId?: string; userId?: string } {
  const row = getDb()
    .prepare(
      `SELECT chat_id, user_id FROM max_known_chats
       WHERE chat_id = ? OR user_id = ?
       LIMIT 1`,
    )
    .get(externalThreadId, externalThreadId) as
    | { chat_id: string; user_id: string | null }
    | undefined;

  if (row) {
    return {
      chatId: row.chat_id,
      userId: row.user_id ?? undefined,
    };
  }

  if (contactId) {
    const contact = getContactForConversation(contactId);
    const channelUserId = contact?.channelUserIds?.max;
    if (channelUserId) {
      const byUser = getDb()
        .prepare(
          `SELECT chat_id, user_id FROM max_known_chats
           WHERE chat_id = ? OR user_id = ?
           LIMIT 1`,
        )
        .get(channelUserId, channelUserId) as
        | { chat_id: string; user_id: string | null }
        | undefined;
      if (byUser) {
        return {
          chatId: byUser.chat_id,
          userId: byUser.user_id ?? channelUserId,
        };
      }
      return { userId: channelUserId };
    }
  }

  if (/^\d+$/.test(externalThreadId) && externalThreadId.length > 8) {
    return { chatId: externalThreadId };
  }

  return { userId: externalThreadId };
}

export function seedDemoDataIfEmpty(): void {
  const db = getDb();
  const opCount = (
    db.prepare("SELECT COUNT(*) AS count FROM operators").get() as {
      count: number;
    }
  ).count;

  if (opCount === 0) {
    for (const op of [
      { id: "op-1", name: "Анна Петрова", avatarInitials: "АП", online: 1 },
      { id: "op-2", name: "Иван Сидоров", avatarInitials: "ИС", online: 1 },
      { id: "op-3", name: "Мария Козлова", avatarInitials: "МК", online: 0 },
    ]) {
      db.prepare(
        "INSERT INTO operators (id, name, avatar_initials, online) VALUES (@id, @name, @avatarInitials, @online)",
      ).run(op);
    }
  }

  if (process.env.SEED_DEMO_DATA === "false") return;
  if (!isDatabaseEmpty()) return;
  // Demo conversations removed — real data comes from MAX / integrations.
}

export function getContactForConversation(contactId: string): Contact | undefined {
  const contact = getContact(contactId);
  if (!contact) return undefined;
  return enrichContact(contact);
}

function getContactConversationMap(
  contactId: string,
): Partial<Record<Channel, string>> {
  const rows = getDb()
    .prepare(
      `SELECT id, channel FROM conversations
       WHERE contact_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(contactId) as Array<{ id: string; channel: Channel }>;

  const map: Partial<Record<Channel, string>> = {};
  for (const row of rows) {
    if (!map[row.channel]) map[row.channel] = row.id;
  }
  return map;
}

function getContactChannels(
  contactId: string,
  contact?: Contact,
  conversationMap?: Partial<Record<Channel, string>>,
): Channel[] {
  const map = conversationMap ?? getContactConversationMap(contactId);
  const channels = new Set<Channel>(Object.keys(map) as Channel[]);

  const source = contact ?? getContact(contactId);
  if (source?.channelUserIds) {
    for (const channel of Object.keys(source.channelUserIds) as Channel[]) {
      if (source.channelUserIds[channel]) channels.add(channel);
    }
  }

  return ALL_CHANNELS.filter((channel) => channels.has(channel));
}

function enrichContact(contact: Contact): Contact {
  const channelConversations = getContactConversationMap(contact.id);
  return {
    ...contact,
    channelConversations,
    channels: getContactChannels(contact.id, contact, channelConversations),
  };
}

export function listContacts(query?: string): Contact[] {
  seedDemoDataIfEmpty();
  const rows = getDb()
    .prepare(
      `SELECT * FROM contacts
       ORDER BY unicode_lower(name) ASC, id ASC`,
    )
    .all() as ContactRow[];

  const contacts = rows.map((row) => enrichContact(rowToContact(row)));

  const trimmed = query?.trim();
  if (!trimmed) return contacts;

  const needle = trimmed.toLowerCase();
  return contacts.filter((contact) => {
    const haystack = [
      contact.name,
      contact.phone,
      contact.email,
      contact.company,
      contact.notes,
      ...(contact.tags ?? []),
      ...(contact.channels ?? []).map((channel) => CHANNEL_CONFIG[channel].label),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function getContactById(id: string): Contact | null {
  const contact = getContact(id);
  if (!contact) return null;
  return enrichContact(contact);
}

export function updateContactDetails(
  id: string,
  patch: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
    notes?: string | null;
    tags?: string[];
    dealStage?: DealStage;
  },
): Contact | null {
  const existing = getContact(id);
  if (!existing) return null;

  const next: Contact = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    phone:
      patch.phone === null
        ? undefined
        : patch.phone !== undefined
          ? patch.phone.trim() || undefined
          : existing.phone,
    email:
      patch.email === null
        ? undefined
        : patch.email !== undefined
          ? patch.email.trim() || undefined
          : existing.email,
    company:
      patch.company === null
        ? undefined
        : patch.company !== undefined
          ? patch.company.trim() || undefined
          : existing.company,
    notes:
      patch.notes === null
        ? undefined
        : patch.notes !== undefined
          ? patch.notes.trim() || undefined
          : existing.notes,
    tags: patch.tags ?? existing.tags,
    dealStage: patch.dealStage ?? existing.dealStage,
  };

  upsertContact(next);
  return getContactById(id);
}

export function createContact(input: {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  tags?: string[];
}): Contact {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Укажите имя контакта");
  }

  const contact: Contact = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    company: input.company?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    tags: input.tags?.length ? input.tags : ["Ручной"],
    dealStage: "new",
  };

  upsertContact(contact);
  return getContactById(contact.id)!;
}

export function listOperators(): Operator[] {
  seedDemoDataIfEmpty();
  return getDb()
    .prepare("SELECT id, name, avatar_initials AS avatarInitials, online FROM operators")
    .all()
    .map((row) => ({
      ...(row as Operator),
      online: Boolean((row as { online: number }).online),
    }));
}

export function listConversations(channel?: Channel | "all"): Conversation[] {
  seedDemoDataIfEmpty();
  const orderBy = "ORDER BY awaiting_reply DESC, updated_at DESC";
  const rows =
    channel && channel !== "all"
      ? (getDb()
          .prepare(
            `SELECT * FROM conversations WHERE channel = ? ${orderBy}`,
          )
          .all(channel) as ConversationRow[])
      : (getDb()
          .prepare(`SELECT * FROM conversations ${orderBy}`)
          .all() as ConversationRow[]);
  return rows.map(rowToConversation);
}

function buildSearchSnippet(content: string, query: string): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  if (index < 0) {
    return content.length > 80 ? `${content.slice(0, 77)}…` : content;
  }

  const start = Math.max(0, index - 24);
  const end = Math.min(content.length, index + query.length + 24);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

export function searchConversations(
  query: string,
  channel?: Channel | "all",
): Conversation[] {
  seedDemoDataIfEmpty();
  const trimmed = query.trim();
  if (!trimmed) {
    return listConversations(channel);
  }

  const like = `%${trimmed.toLowerCase()}%`;
  const channelFilter =
    channel && channel !== "all" ? "AND c.channel = ?" : "";
  const params =
    channel && channel !== "all" ? [like, like, like, like, like, like, channel] : [like, like, like, like, like, like];

  const rows = getDb()
    .prepare(
      `SELECT DISTINCT c.*
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE (
         unicode_lower(ct.name) LIKE ?
         OR unicode_lower(COALESCE(ct.phone, '')) LIKE ?
         OR unicode_lower(COALESCE(ct.email, '')) LIKE ?
         OR unicode_lower(c.last_message_preview) LIKE ?
         OR EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id AND unicode_lower(m.content) LIKE ?
         )
         OR EXISTS (
           SELECT 1 FROM messages m
           JOIN message_attachments ma ON ma.message_id = m.id
           WHERE m.conversation_id = c.id AND unicode_lower(COALESCE(ma.file_name, '')) LIKE ?
         )
       )
       ${channelFilter}
       ORDER BY c.awaiting_reply DESC, c.updated_at DESC`,
    )
    .all(...params) as ConversationRow[];

  const findMessageMatch = getDb().prepare(
    `SELECT content FROM messages
     WHERE conversation_id = ? AND unicode_lower(content) LIKE ?
     ORDER BY created_at DESC
     LIMIT 1`,
  );

  return rows.map((row) => {
    const conversation = rowToConversation(row);
    const lowerPreview = conversation.lastMessagePreview.toLowerCase();
    const lowerQuery = trimmed.toLowerCase();
    if (lowerPreview.includes(lowerQuery)) {
      return conversation;
    }

    const match = findMessageMatch.get(conversation.id, like) as
      | { content: string }
      | undefined;
    if (match?.content) {
      return {
        ...conversation,
        searchMatch: buildSearchSnippet(match.content, trimmed),
      };
    }

    return conversation;
  });
}

export function getConversationDetail(id: string): ConversationDetail | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as ConversationRow | undefined;
  if (!row) return null;

  const conversation = rowToConversation(row);
  const contact = getContact(conversation.contactId);
  if (!contact) return null;

  const messageRows = getDb()
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(id) as MessageRow[];

  const attachmentMap = loadAttachmentsForMessages(messageRows.map((row) => row.id));
  const messages = enrichMessagesWithReplies(
    messageRows.map((row) => rowToMessage(row, attachmentMap.get(row.id))),
  );

  return {
    ...conversation,
    contact,
    messages,
    assignedOperator: conversation.assignedTo
      ? getOperator(conversation.assignedTo)
      : undefined,
  };
}

export function dismissConversationReply(id: string): Conversation | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as ConversationRow | undefined;
  if (!row) return null;

  const sortAt = bottomConversationSortTimestamp();
  getDb()
    .prepare(
      `UPDATE conversations
       SET awaiting_reply = 0, unread_count = 0, updated_at = ?
       WHERE id = ?`,
    )
    .run(sortAt, id);

  return rowToConversation({
    ...row,
    awaiting_reply: 0,
    unread_count: 0,
    updated_at: sortAt,
  });
}

export function dismissAllAwaitingReplies(
  channel: Channel | "all" = "all",
): number {
  const sortAt = bottomConversationSortTimestamp();
  const result =
    channel === "all"
      ? getDb()
          .prepare(
            `UPDATE conversations
             SET awaiting_reply = 0, unread_count = 0, updated_at = ?
             WHERE awaiting_reply = 1`,
          )
          .run(sortAt)
      : getDb()
          .prepare(
            `UPDATE conversations
             SET awaiting_reply = 0, unread_count = 0, updated_at = ?
             WHERE awaiting_reply = 1 AND channel = ?`,
          )
          .run(sortAt, channel);

  return result.changes;
}

export function processIncomingMessage(
  payload: IncomingMessagePayload,
): { message: Message; conversation: Conversation; created: boolean } | null {
  seedDemoDataIfEmpty();

  const maxChatId =
    payload.channel === "max"
      ? (payload.maxChatId ??
        (payload.externalThreadId.length > 8
          ? payload.externalThreadId
          : undefined))
      : undefined;
  const maxUserId =
    payload.channel === "max" ? payload.maxUserId : undefined;
  const threadId =
    payload.channel === "max"
      ? (maxChatId ?? maxUserId ?? payload.externalThreadId)
      : payload.channel === "whatsapp"
        ? getWhatsAppCanonicalThreadId(payload.externalThreadId)
        : payload.externalThreadId;

  if (payload.channel === "max") {
    registerMaxKnownChat({
      chatId: maxChatId ?? threadId,
      userId: maxUserId,
      contactName: payload.senderName,
      source: "incoming",
    });
  }

  const existingProcessed = getDb()
    .prepare(
      "SELECT 1 FROM processed_external_ids WHERE channel = ? AND external_message_id = ?",
    )
    .get(payload.channel, payload.externalMessageId);

  if (existingProcessed) {
    const existing =
      payload.channel === "max"
        ? findMaxConversation(maxChatId, maxUserId)
        : payload.channel === "whatsapp"
          ? findWhatsAppConversation(payload.externalThreadId)
          : findConversationByExternalThread(payload.channel, threadId);
    if (!existing) return null;
    const lastMessage = findExistingMessageRow(existing.id, payload);
    if (!lastMessage) return null;

    if (payload.attachments?.length) {
      const existingAttachments = loadAttachmentsForMessages([
        lastMessage.id,
      ]).get(lastMessage.id);
      if (!existingAttachments?.length) {
        const message = rowToMessage(lastMessage);
        message.attachments = insertAttachmentsForMessage(
          message.id,
          existing.id,
          payload.attachments,
        );
        if (payload.content.trim() && !message.content.trim()) {
          message.content = payload.content;
          getDb()
            .prepare("UPDATE messages SET content = ? WHERE id = ?")
            .run(message.content, message.id);
        }
        const preview = messagePreviewText(message.content, message.attachments);
        getDb()
          .prepare(
            "UPDATE conversations SET last_message_preview = ?, updated_at = ?, awaiting_reply = 1 WHERE id = ?",
          )
          .run(preview, new Date().toISOString(), existing.id);
        return { message, conversation: existing, created: false };
      }
    }

    const edited = applyMessageEdit(
      lastMessage,
      payload.content,
      existing.id,
    );
    if (edited) {
      return { message: edited, conversation: existing, created: false };
    }

    repairMessageTimestamp(lastMessage.id, payload.createdAt, lastMessage.created_at);

    return {
      message: rowToMessage(
        lastMessage,
        loadAttachmentsForMessages([lastMessage.id]).get(lastMessage.id),
      ),
      conversation: existing,
      created: false,
    };
  }

  let conversation =
    payload.channel === "max"
      ? findMaxConversation(maxChatId, maxUserId)
      : payload.channel === "whatsapp"
        ? findWhatsAppConversation(payload.externalThreadId)
        : findConversationByExternalThread(payload.channel, threadId);
  let created = false;

  if (
    conversation &&
    payload.channel === "max" &&
    maxChatId &&
    conversation.externalThreadId !== maxChatId
  ) {
    upgradeMaxConversationThread(
      conversation.id,
      maxChatId,
      maxUserId,
      payload.senderName,
    );
    conversation =
      findConversationByExternalThread("max", maxChatId) ?? conversation;
  }

  const isOutbound = payload.direction === "out";

  if (!conversation) {
    if (isOutbound && payload.channel !== "telegram") {
      return null;
    }

    let contact =
      payload.channel === "max" && maxUserId
        ? findContactByChannelUser("max", maxUserId)
        : findContactByChannelUser(payload.channel, threadId);

    if (!contact) {
      contact = createContactFromInbound(payload);
    } else if (maxUserId && contact.channelUserIds?.max !== maxUserId) {
      contact.channelUserIds = { ...contact.channelUserIds, max: maxUserId };
      upsertContact(contact);
    }

    conversation = findConversationByContactAndChannel(
      contact.id,
      payload.channel,
    );

    if (conversation && payload.channel === "max" && maxChatId) {
      if (conversation.externalThreadId !== maxChatId) {
        upgradeMaxConversationThread(
          conversation.id,
          maxChatId,
          maxUserId,
          payload.senderName,
        );
        conversation =
          findConversationByExternalThread("max", maxChatId) ?? conversation;
      }
    }

    if (!conversation) {
      conversation = createConversation(
        contact.id,
        payload.channel,
        threadId,
        payload.content,
      );
      created = true;
      autoAssignOperator(conversation.id);
      conversation =
        (payload.channel === "max"
          ? findMaxConversation(maxChatId, maxUserId)
          : payload.channel === "whatsapp"
            ? findWhatsAppConversation(payload.externalThreadId)
            : findConversationByExternalThread(payload.channel, threadId)) ??
        conversation;
    }
  } else if (!conversation.assignedTo) {
    autoAssignOperator(conversation.id);
    conversation =
      (payload.channel === "max"
        ? findMaxConversation(maxChatId, maxUserId)
        : payload.channel === "whatsapp"
          ? findWhatsAppConversation(payload.externalThreadId)
          : findConversationByExternalThread(payload.channel, threadId)) ??
      conversation;
  }

  const duplicateOutbound = findExistingMessageRow(conversation!.id, payload);

  if (duplicateOutbound) {
    getDb()
      .prepare(
        "INSERT OR IGNORE INTO processed_external_ids (channel, external_message_id) VALUES (?, ?)",
      )
      .run(payload.channel, payload.externalMessageId);

    const edited = applyMessageEdit(
      duplicateOutbound,
      payload.content,
      conversation!.id,
    );
    if (edited) {
      return {
        message: edited,
        conversation: conversation!,
        created: false,
      };
    }

    repairMessageTimestamp(
      duplicateOutbound.id,
      payload.createdAt,
      duplicateOutbound.created_at,
    );

    return {
      message: rowToMessage(
        duplicateOutbound,
        loadAttachmentsForMessages([duplicateOutbound.id]).get(
          duplicateOutbound.id,
        ),
      ),
      conversation: conversation!,
      created: false,
    };
  }

  const message: Message = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    conversationId: conversation!.id,
    content: payload.content,
    direction: isOutbound ? "out" : "in",
    status: isOutbound ? "delivered" : "delivered",
    externalId:
      payload.channelMessageId ??
      (payload.externalMessageId.replace(/^max-/, "").startsWith("mid.")
        ? payload.externalMessageId.replace(/^max-/, "")
        : payload.externalMessageId),
    replyToMessageId: payload.replyToChannelMessageId
      ? findMessageIdByChannelMessageId(
          conversation!.id,
          payload.replyToChannelMessageId,
        )
      : undefined,
    createdAt: payload.createdAt ?? new Date().toISOString(),
  };

  let savedAttachments: MessageAttachment[] | undefined;

  const tx = getDb().transaction(() => {
    getDb()
      .prepare(
        "INSERT INTO processed_external_ids (channel, external_message_id) VALUES (?, ?)",
      )
      .run(payload.channel, payload.externalMessageId);
    insertMessage(message);
    if (payload.attachments?.length) {
      savedAttachments = insertAttachmentsForMessage(
        message.id,
        conversation!.id,
        payload.attachments,
      );
      message.attachments = savedAttachments;
    }
    const preview = messagePreviewText(payload.content, savedAttachments);
    getDb()
      .prepare(
        `UPDATE conversations
         SET last_message_preview = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(preview, message.createdAt, conversation!.id);

    if (!isOutbound) {
      getDb()
        .prepare(
          "UPDATE conversations SET unread_count = unread_count + 1 WHERE id = ?",
        )
        .run(conversation!.id);
    }

    syncAwaitingReplyFromLastMessage(conversation!.id);
  });
  tx();

  return {
    message,
    conversation:
      (payload.channel === "max"
        ? findMaxConversation(maxChatId, maxUserId)
        : findConversationByExternalThread(payload.channel, threadId))!,
    created,
  };
}

export function mergeDuplicateMaxConversations(): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.contact_id, c.external_thread_id, c.unread_count, c.awaiting_reply,
              c.last_message_preview, c.updated_at,
              ct.name, ct.channel_user_ids
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE c.channel = 'max'
       ORDER BY c.updated_at DESC`,
    )
    .all() as Array<{
    id: string;
    contact_id: string;
    external_thread_id: string | null;
    unread_count: number;
    awaiting_reply: number;
    last_message_preview: string;
    updated_at: string;
    name: string;
    channel_user_ids: string | null;
  }>;

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.name.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let merged = 0;
  const tx = db.transaction(() => {
    for (const group of groups.values()) {
      if (group.length < 2) continue;

      group.sort(
        (a, b) =>
          (b.external_thread_id?.length ?? 0) -
          (a.external_thread_id?.length ?? 0),
      );
      const keep = group[0];
      let unread = keep.unread_count;
      let awaitingReply = keep.awaiting_reply;
      let preview = keep.last_message_preview;
      let updatedAt = keep.updated_at;

      for (const dup of group.slice(1)) {
        db.prepare(
          "UPDATE messages SET conversation_id = ? WHERE conversation_id = ?",
        ).run(keep.id, dup.id);
        unread += dup.unread_count;
        awaitingReply =
          awaitingReply || dup.awaiting_reply ? 1 : 0;
        if (dup.updated_at > updatedAt) {
          updatedAt = dup.updated_at;
          preview = dup.last_message_preview;
        }
        db.prepare("DELETE FROM conversations WHERE id = ?").run(dup.id);
        // Reassign messages still on duplicate contact, then remove orphan contact
        const orphanMessages = (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM conversations WHERE contact_id = ?",
            )
            .get(dup.contact_id) as { count: number }
        ).count;
        if (orphanMessages === 0) {
          db.prepare("DELETE FROM contacts WHERE id = ?").run(dup.contact_id);
        }
        merged += 1;
      }

      db.prepare(
        "UPDATE conversations SET unread_count = ?, awaiting_reply = ?, last_message_preview = ?, updated_at = ? WHERE id = ?",
      ).run(unread, awaitingReply, preview, updatedAt, keep.id);
    }
  });
  tx();
  return merged;
}

export function findOrCreateMaxConversation(input: {
  chatId: string;
  userId?: string;
  senderName: string;
  preview: string;
}): Conversation {
  registerMaxKnownChat({
    chatId: input.chatId,
    userId: input.userId,
    contactName: input.senderName,
    source: "history",
  });

  let conversation = findConversationByExternalThread("max", input.chatId);
  if (conversation) return conversation;

  let contact = input.userId
    ? findContactByChannelUser("max", input.userId)
    : undefined;

  if (!contact) {
    contact = {
      id: `c-${Date.now()}`,
      name: input.senderName,
      tags: ["MAX"],
      dealStage: "new",
      channelUserIds: input.userId ? { max: input.userId } : undefined,
    };
    upsertContact(contact);
  }

  conversation = createConversation(
    contact.id,
    "max",
    input.chatId,
    input.preview,
  );
  autoAssignOperator(conversation.id);
  return (
    findConversationByExternalThread("max", input.chatId) ?? conversation
  );
}

export function importHistoricalMessages(
  conversationId: string,
  items: Array<{
    externalId: string;
    content: string;
    direction: "in" | "out";
    createdAt: string;
  }>,
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  const tx = getDb().transaction(() => {
    for (const item of items) {
      const exists = getDb()
        .prepare(
          "SELECT 1 FROM messages WHERE conversation_id = ? AND external_id = ?",
        )
        .get(conversationId, item.externalId);
      if (exists) {
        skipped += 1;
        continue;
      }

      insertMessage({
        id: `m-hist-${item.externalId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`,
        conversationId,
        content: item.content,
        direction: item.direction,
        status: item.direction === "out" ? "delivered" : "read",
        externalId: item.externalId,
        createdAt: item.createdAt,
      });
      imported += 1;
    }

    if (imported > 0) {
      const latest = getDb()
        .prepare(
          "SELECT content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .get(conversationId) as { content: string; created_at: string } | undefined;
      if (latest) {
        getDb()
          .prepare(
            "UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?",
          )
          .run(latest.content, latest.created_at, conversationId);
      }
    }
  });
  tx();

  syncAwaitingReplyFromLastMessage(conversationId);

  return { imported, skipped };
}

export function importMessageWithAttachments(
  conversationId: string,
  item: {
    externalId: string;
    content: string;
    direction: "in" | "out";
    createdAt: string;
    attachments?: IncomingAttachmentPayload[];
  },
): { imported: boolean; skipped: boolean; attachmentsAdded: number } {
  const existing = getDb()
    .prepare(
      "SELECT id, content FROM messages WHERE conversation_id = ? AND external_id = ?",
    )
    .get(conversationId, item.externalId) as
    | { id: string; content: string }
    | undefined;

  if (existing) {
    const attRow = getDb()
      .prepare(
        "SELECT COUNT(*) as count FROM message_attachments WHERE message_id = ?",
      )
      .get(existing.id) as { count: number };

    if (attRow.count === 0 && item.attachments?.length) {
      insertAttachmentsForMessage(
        existing.id,
        conversationId,
        item.attachments,
      );
      if (
        (existing.content === "[сообщение без текста]" ||
          !existing.content.trim()) &&
        item.content.trim()
      ) {
        getDb()
          .prepare("UPDATE messages SET content = ? WHERE id = ?")
          .run(item.content, existing.id);
      }
      return {
        imported: false,
        skipped: true,
        attachmentsAdded: item.attachments.length,
      };
    }

    return { imported: false, skipped: true, attachmentsAdded: 0 };
  }

  const message: Message = {
    id: `m-hist-${item.externalId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`,
    conversationId,
    content: item.content,
    direction: item.direction,
    status: item.direction === "out" ? "delivered" : "read",
    externalId: item.externalId,
    createdAt: item.createdAt,
  };

  let attachmentsAdded = 0;

  const tx = getDb().transaction(() => {
    insertMessage(message);
    if (item.attachments?.length) {
      insertAttachmentsForMessage(
        message.id,
        conversationId,
        item.attachments,
      );
      attachmentsAdded = item.attachments.length;
    }

    const latest = getDb()
      .prepare(
        "SELECT created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(conversationId) as { created_at: string } | undefined;

    if (latest?.created_at === item.createdAt) {
      const preview = messagePreviewText(item.content, message.attachments);
      getDb()
        .prepare(
          "UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?",
        )
        .run(preview, item.createdAt, conversationId);
    }
  });
  tx();

  return { imported: true, skipped: false, attachmentsAdded };
}

export function refreshConversationReplyState(conversationId: string): void {
  syncAwaitingReplyFromLastMessage(conversationId);
}

export async function sendMessage(
  conversationId: string,
  content: string,
  operatorId?: string,
  attachments?: OutboundAttachmentPayload[],
  replyToMessageId?: string,
): Promise<{ message: Message | null; error?: string }> {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(conversationId) as ConversationRow | undefined;
  const trimmed = content.trim();
  if (!row || (!trimmed && !attachments?.length)) {
    return { message: null, error: "Диалог не найден" };
  }

  const conversation = rowToConversation(row);
  const senderId = operatorId ?? conversation.assignedTo ?? "op-1";
  const replyToChannelMessageId = resolveReplyToChannelMessageId(replyToMessageId);

  if (replyToMessageId && !replyToChannelMessageId && conversation.channel === "max") {
    return {
      message: null,
      error:
        "Не удалось ответить: у сообщения нет ID в MAX. Отправьте обычное сообщение без цитаты или синхронизируйте историю в настройках.",
    };
  }

  const message: Message = {
    id: `m-${Date.now()}`,
    conversationId,
    content: trimmed,
    direction: "out",
    status: "sent",
    operatorId: senderId,
    replyToMessageId,
    createdAt: new Date().toISOString(),
  };

  insertMessage(message);
  if (attachments?.length) {
    message.attachments = insertAttachmentsForMessage(
      message.id,
      conversationId,
      attachments,
    );
  }

  const preview = messagePreviewText(trimmed, message.attachments);
  getDb()
    .prepare(
      "UPDATE conversations SET last_message_preview = ?, updated_at = ?, awaiting_reply = 0, unread_count = 0 WHERE id = ?",
    )
    .run(preview, message.createdAt, conversationId);

  if (conversation.externalThreadId) {
    const maxTargets =
      conversation.channel === "max"
        ? getMaxIncomingMode() === "wazzup"
          ? { chatId: conversation.externalThreadId }
          : resolveMaxOutboundTargets(
              conversation.externalThreadId,
              conversation.contactId,
            )
        : conversation.channel === "max_personal"
          ? (() => {
              const contact = getContactForConversation(conversation.contactId);
              const userId =
                contact?.channelUserIds?.max_personal ??
                conversation.externalThreadId;
              return {
                chatId: conversation.externalThreadId,
                userId,
              };
            })()
          : {};

    const publicBase = getPublicAppBaseUrl();
    const attachmentUrls =
      publicBase && message.attachments?.length
        ? message.attachments.map(
            (attachment) => `${publicBase}/api/media/${attachment.id}`,
          )
        : undefined;

    const result = await dispatchOutboundMessage({
      channel: conversation.channel,
      externalThreadId:
        maxTargets.chatId ??
        maxTargets.userId ??
        conversation.externalThreadId,
      maxChatId: maxTargets.chatId,
      maxUserId: maxTargets.userId,
      content: trimmed,
      attachments,
      attachmentUrls,
      replyToChannelMessageId,
    });

    message.status = result.ok ? "sent" : "failed";
    if (result.externalId) {
      message.externalId = result.externalId;
      getDb()
        .prepare(
          "INSERT OR IGNORE INTO processed_external_ids (channel, external_message_id) VALUES (?, ?)",
        )
        .run(
          conversation.channel,
          conversation.channel === "max"
            ? getMaxIncomingMode() === "wazzup"
              ? `wazzup-max-${result.externalId}`
              : `max-${result.externalId}`
            : conversation.channel === "whatsapp"
              ? `wa-${result.externalId}`
              : conversation.channel === "max_personal" &&
                !result.externalId.startsWith("max-personal-")
              ? `max-personal-${result.externalId}`
              : result.externalId,
        );
    }

    if (
      conversation.channel === "max_personal" &&
      result.ok &&
      "chatId" in result &&
      result.chatId &&
      result.chatId !== conversation.externalThreadId
    ) {
      getDb()
        .prepare(
          "UPDATE conversations SET external_thread_id = ? WHERE id = ?",
        )
        .run(result.chatId, conversationId);
    }

    updateMessage(message);

    if (!result.ok) {
      return { message, error: result.error ?? "Не удалось отправить сообщение" };
    }
  }

  return { message };
}

export function getMessageById(messageId: string): (Message & {
  channel: Channel;
  externalThreadId?: string;
}) | null {
  const row = getDb()
    .prepare(
      `SELECT m.*, c.channel, c.external_thread_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = ?`,
    )
    .get(messageId) as
    | (MessageRow & { channel: Channel; external_thread_id: string | null })
    | undefined;
  if (!row) return null;
  const attachments = loadAttachmentsForMessages([row.id]).get(row.id);
  return {
    ...rowToMessage(row, attachments),
    channel: row.channel,
    externalThreadId: row.external_thread_id ?? undefined,
  };
}

export function getAttachmentById(
  attachmentId: string,
): (MessageAttachment & { messageId: string; conversationId: string }) | null {
  const row = getDb()
    .prepare(
      `SELECT a.*, m.conversation_id
       FROM message_attachments a
       JOIN messages m ON m.id = a.message_id
       WHERE a.id = ?`,
    )
    .get(attachmentId) as
    | (AttachmentRow & { conversation_id: string })
    | undefined;
  if (!row) return null;
  return {
    ...rowToAttachment(row),
    messageId: row.message_id,
    conversationId: row.conversation_id,
  };
}

export async function deleteMessage(
  messageId: string,
  options?: { revoke?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const message = getMessageById(messageId);
  if (!message) {
    return { ok: false, error: "Сообщение не найдено" };
  }

  if (message.externalId && message.externalThreadId) {
    const channelMessageId =
      extractChannelMessageId(message.externalId) ?? message.externalId;
    const remote = await deleteChannelMessage({
      channel: message.channel,
      externalThreadId: message.externalThreadId,
      channelMessageId,
      externalId: message.externalId,
      revoke: options?.revoke ?? false,
    });
    if (!remote.ok && options?.revoke) {
      return { ok: false, error: remote.error ?? "Не удалось удалить сообщение" };
    }
  }

  const attachmentRows = getDb()
    .prepare("SELECT * FROM message_attachments WHERE message_id = ?")
    .all(messageId) as AttachmentRow[];
  for (const attachment of attachmentRows) {
    deleteMediaFile(attachment.storage_path);
  }

  getDb().prepare("DELETE FROM message_attachments WHERE message_id = ?").run(messageId);
  getDb().prepare("DELETE FROM messages WHERE id = ?").run(messageId);

  const latest = getDb()
    .prepare(
      "SELECT content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(message.conversationId) as
    | { content: string; created_at: string }
    | undefined;

  if (latest) {
    getDb()
      .prepare(
        "UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?",
      )
      .run(latest.content, latest.created_at, message.conversationId);
  } else {
    getDb()
      .prepare(
        "UPDATE conversations SET last_message_preview = '', updated_at = ? WHERE id = ?",
      )
      .run(new Date().toISOString(), message.conversationId);
  }

  return { ok: true };
}

export async function editMessage(
  messageId: string,
  content: string,
): Promise<{ ok: boolean; message?: Message; error?: string }> {
  const existing = getMessageById(messageId);
  if (!existing) {
    return { ok: false, error: "Сообщение не найдено" };
  }
  if (existing.direction !== "out") {
    return { ok: false, error: "Можно редактировать только исходящие сообщения" };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "Текст не может быть пустым" };
  }
  if (trimmed === existing.content.trim()) {
    return { ok: true, message: existing };
  }
  if (existing.attachments?.length) {
    return {
      ok: false,
      error: "Сообщения с вложениями пока нельзя редактировать",
    };
  }

  if (existing.externalId && existing.externalThreadId) {
    const channelMessageId =
      extractChannelMessageId(existing.externalId) ?? existing.externalId;
    const remote = await editChannelMessage({
      channel: existing.channel,
      externalThreadId: existing.externalThreadId,
      channelMessageId,
      externalId: existing.externalId,
      content: trimmed,
    });
    if (!remote.ok) {
      return { ok: false, error: remote.error ?? "Не удалось изменить сообщение" };
    }
  }

  const editedAt = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE messages
       SET content = ?, previous_content = ?, edited_at = ?
       WHERE id = ?`,
    )
    .run(trimmed, existing.content, editedAt, existing.id);

  const latest = getDb()
    .prepare(
      "SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(existing.conversationId) as { id: string } | undefined;

  if (latest?.id === existing.id) {
    getDb()
      .prepare(
        "UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?",
      )
      .run(trimmed, editedAt, existing.conversationId);
  }

  const attachments = loadAttachmentsForMessages([existing.id]).get(existing.id);
  return {
    ok: true,
    message: rowToMessage(
      {
        id: existing.id,
        conversation_id: existing.conversationId,
        content: trimmed,
        direction: existing.direction,
        status: existing.status,
        operator_id: existing.operatorId ?? null,
        external_id: existing.externalId ?? null,
        reply_to_message_id: existing.replyToMessageId ?? null,
        created_at: existing.createdAt,
        previous_content: existing.content,
        edited_at: editedAt,
      },
      attachments,
    ),
  };
}

export async function startOutboundConversation(params: {
  channel: Channel;
  externalThreadId: string;
  contactName: string;
  content: string;
  operatorId?: string;
  username?: string;
  channelUserId?: string;
}): Promise<{ conversation: Conversation; message: Message; error?: string } | null> {
  const trimmed = params.content.trim();
  if (!trimmed) return null;

  if (params.channel === "max") {
    registerMaxKnownChat({
      chatId: params.externalThreadId,
      contactName: params.contactName,
      source: "outbound",
    });
  }

  let conversation =
    params.channel === "whatsapp"
      ? findWhatsAppConversation(params.externalThreadId)
      : findConversationByExternalThread(
          params.channel,
          params.externalThreadId,
        );

  if (!conversation) {
    let contact = findContactByChannelUser(
      params.channel,
      params.channelUserId ?? params.externalThreadId,
    );

    if (!contact) {
      contact = {
        id: `c-${Date.now()}`,
        name: params.contactName,
        tags: ["Исходящий"],
        dealStage: "new",
        channelUserIds: {
          [params.channel]: params.channelUserId ?? params.externalThreadId,
        },
        notes: params.username ? `@${params.username}` : undefined,
      };
      upsertContact(contact);
    } else if (
      params.channelUserId &&
      contact.channelUserIds?.[params.channel] !== params.channelUserId
    ) {
      contact.channelUserIds = {
        ...contact.channelUserIds,
        [params.channel]: params.channelUserId,
      };
      upsertContact(contact);
    }

    conversation = createConversation(
      contact.id,
      params.channel,
      params.externalThreadId,
      trimmed,
    );
    if (!conversation.assignedTo) {
      autoAssignOperator(conversation.id);
      conversation =
        findConversationByExternalThread(
          params.channel,
          params.externalThreadId,
        ) ?? conversation;
    }
  }

  const { message, error } = await sendMessage(
    conversation.id,
    trimmed,
    params.operatorId ?? conversation.assignedTo,
  );

  if (!message) return null;

  return {
    conversation:
      findConversationByExternalThread(
        params.channel,
        params.externalThreadId,
      )!,
    message,
    error,
  };
}

export function assignConversation(
  conversationId: string,
  operatorId: string | null,
): Conversation | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(conversationId) as ConversationRow | undefined;
  if (!row) return null;

  getDb()
    .prepare(
      "UPDATE conversations SET assigned_to = ?, auto_assigned = 0 WHERE id = ?",
    )
    .run(operatorId, conversationId);

  return rowToConversation({
    ...row,
    assigned_to: operatorId,
    auto_assigned: 0,
  });
}

export function simulateIncomingMessage(
  conversationId: string,
  content: string,
): Message | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(conversationId) as ConversationRow | undefined;
  if (!row || !content.trim()) return null;

  if (!row.assigned_to) {
    autoAssignOperator(conversationId);
  }

  const message: Message = {
    id: `m-${Date.now()}`,
    conversationId,
    content: content.trim(),
    direction: "in",
    status: "delivered",
    createdAt: new Date().toISOString(),
  };

  insertMessage(message);
  getDb()
    .prepare(
      "UPDATE conversations SET last_message_preview = ?, updated_at = ?, awaiting_reply = 1, unread_count = unread_count + 1 WHERE id = ?",
    )
    .run(content.trim(), message.createdAt, conversationId);

  return message;
}

export function getStats() {
  seedDemoDataIfEmpty();
  const totalUnread = (
    getDb()
      .prepare("SELECT COALESCE(SUM(unread_count), 0) AS total FROM conversations")
      .get() as { total: number }
  ).total;

  const byChannel = ALL_CHANNELS.map((ch) => {
    const stats = getDb()
      .prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(unread_count), 0) AS unread FROM conversations WHERE channel = ?",
      )
      .get(ch) as { count: number; unread: number };
    return { channel: ch, count: stats.count, unread: stats.unread };
  });

  const unassigned = (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM conversations WHERE assigned_to IS NULL",
      )
      .get() as { count: number }
  ).count;

  return {
    totalUnread,
    totalConversations: listConversations().length,
    unassigned,
    byChannel,
  };
}

export function mergeWhatsAppConversationThreads(
  lidThreadId: string,
  phoneThreadId: string,
): boolean {
  if (!lidThreadId || !phoneThreadId || lidThreadId === phoneThreadId) {
    return false;
  }

  const db = getDb();
  const lidConv = db
    .prepare(
      "SELECT * FROM conversations WHERE channel = 'whatsapp' AND external_thread_id = ?",
    )
    .get(lidThreadId) as ConversationRow | undefined;
  const phoneConv = db
    .prepare(
      "SELECT * FROM conversations WHERE channel = 'whatsapp' AND external_thread_id = ?",
    )
    .get(phoneThreadId) as ConversationRow | undefined;

  if (!lidConv || !phoneConv || lidConv.id === phoneConv.id) {
    return false;
  }

  const tx = db.transaction(() => {
    const duplicateIds = db
      .prepare(
        `SELECT lm.id FROM messages lm
         JOIN messages pm ON pm.conversation_id = ? AND pm.external_id = lm.external_id
         WHERE lm.conversation_id = ? AND lm.external_id IS NOT NULL`,
      )
      .all(phoneConv.id, lidConv.id) as Array<{ id: string }>;

    for (const { id } of duplicateIds) {
      db.prepare("DELETE FROM message_attachments WHERE message_id = ?").run(id);
      db.prepare("DELETE FROM messages WHERE id = ?").run(id);
    }

    db.prepare(
      "UPDATE messages SET conversation_id = ? WHERE conversation_id = ?",
    ).run(phoneConv.id, lidConv.id);

    const lidContact = db
      .prepare("SELECT * FROM contacts WHERE id = ?")
      .get(lidConv.contact_id) as ContactRow | undefined;
    const phoneContact = db
      .prepare("SELECT * FROM contacts WHERE id = ?")
      .get(phoneConv.contact_id) as ContactRow | undefined;

    const keepName =
      phoneContact &&
      !phoneContact.name.startsWith("+") &&
      phoneContact.name.trim()
        ? phoneContact.name
        : lidContact?.name.startsWith("+")
          ? lidContact.name
          : phoneContact?.name ?? lidContact?.name;

    if (keepName && phoneContact && keepName !== phoneContact.name) {
      db.prepare("UPDATE contacts SET name = ? WHERE id = ?").run(
        keepName,
        phoneContact.id,
      );
    }

    const unread = phoneConv.unread_count + lidConv.unread_count;
    const awaiting =
      phoneConv.awaiting_reply || lidConv.awaiting_reply ? 1 : 0;
    const preview =
      phoneConv.updated_at >= lidConv.updated_at
        ? phoneConv.last_message_preview
        : lidConv.last_message_preview;
    const updatedAt =
      phoneConv.updated_at >= lidConv.updated_at
        ? phoneConv.updated_at
        : lidConv.updated_at;

    db.prepare(
      `UPDATE conversations
       SET unread_count = ?, awaiting_reply = ?, last_message_preview = ?, updated_at = ?
       WHERE id = ?`,
    ).run(unread, awaiting, preview, updatedAt, phoneConv.id);

    db.prepare("DELETE FROM conversations WHERE id = ?").run(lidConv.id);

    const remaining = db
      .prepare("SELECT COUNT(*) AS count FROM conversations WHERE contact_id = ?")
      .get(lidConv.contact_id) as { count: number };
    if (remaining.count === 0) {
      db.prepare("DELETE FROM contacts WHERE id = ?").run(lidConv.contact_id);
    }
  });

  tx();
  return true;
}

export async function mergeDuplicateWhatsAppConversations(
  resolveLidToPhone: (lid: string) => Promise<string | null>,
  resolvePhoneToLid?: (phone: string) => Promise<string | null>,
): Promise<number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT external_thread_id FROM conversations WHERE channel = 'whatsapp'`,
    )
    .all() as Array<{ external_thread_id: string | null }>;

  let merged = 0;
  for (const row of rows) {
    const threadId = row.external_thread_id;
    if (!threadId) continue;

    if (isWhatsAppLidIdentifier(threadId)) {
      const phone = await resolveLidToPhone(threadId);
      if (phone) {
        registerWhatsAppThreadAlias(threadId, phone);
        merged += 1;
      }
      continue;
    }

    if (isWhatsAppPhoneIdentifier(threadId) && resolvePhoneToLid) {
      const lid = await resolvePhoneToLid(threadId);
      if (lid) {
        registerWhatsAppThreadAlias(lid, threadId);
        merged += 1;
      }
    }
  }

  return merged;
}

/** Fix Telegram message dates imported without createdAt (shows as "today"). */
export function repairTelegramMessageTimestamps(): number {
  const processed = getDb()
    .prepare(
      `SELECT external_message_id FROM processed_external_ids
       WHERE channel = 'telegram' AND external_message_id LIKE 'tg-user-%'`,
    )
    .all() as Array<{ external_message_id: string }>;

  let fixed = 0;
  for (const { external_message_id } of processed) {
    const match = external_message_id.match(/^tg-user-(\d+)-(\d+)$/);
    if (!match) continue;
    const [, msgId, unix] = match;
    const correctAt = new Date(Number(unix) * 1000).toISOString();

    const row = getDb()
      .prepare(
        `SELECT m.id, m.created_at FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.channel = 'telegram' AND m.external_id = ?`,
      )
      .get(msgId) as { id: string; created_at: string } | undefined;

    if (!row) continue;

    const existingMs = new Date(row.created_at).getTime();
    const correctMs = new Date(correctAt).getTime();
    if (!Number.isFinite(existingMs) || !Number.isFinite(correctMs)) continue;
    if (Math.abs(existingMs - correctMs) < 60 * 60 * 1000) continue;

    getDb()
      .prepare("UPDATE messages SET created_at = ? WHERE id = ?")
      .run(correctAt, row.id);
    fixed++;
  }

  return fixed;
}

// Touch DB on module load in Node runtime.
if (typeof window === "undefined") {
  getDb();
}
