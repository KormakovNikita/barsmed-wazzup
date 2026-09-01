import { getDb, isDatabaseEmpty } from "@/lib/db";
import { ALL_CHANNELS } from "@/lib/channels";
import { getAssignmentStrategy, pickOperatorForAssignment } from "@/lib/assignment";
import { dispatchOutboundMessage, deleteChannelMessage } from "@/lib/integrations";
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
  created_at: string;
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
    unreadCount: row.unread_count,
    lastMessagePreview: row.last_message_preview,
    updatedAt: row.updated_at,
  };
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
    createdAt: row.created_at,
    attachments,
  };
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
         unread_count, last_message_preview, updated_at
       ) VALUES (
         @id, @contactId, @channel, @externalThreadId, @assignedTo, @autoAssigned,
         @unreadCount, @lastMessagePreview, @updatedAt
       )
       ON CONFLICT(id) DO UPDATE SET
         assigned_to = excluded.assigned_to,
         auto_assigned = excluded.auto_assigned,
         unread_count = excluded.unread_count,
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
      lastMessagePreview: conversation.lastMessagePreview,
      updatedAt: conversation.updatedAt,
    });
}

function insertMessage(message: Message): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO messages (
         id, conversation_id, content, direction, status, operator_id, external_id, created_at
       ) VALUES (
         @id, @conversationId, @content, @direction, @status, @operatorId, @externalId, @createdAt
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
  return getContact(contactId);
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
  const rows =
    channel && channel !== "all"
      ? (getDb()
          .prepare(
            "SELECT * FROM conversations WHERE channel = ? ORDER BY updated_at DESC",
          )
          .all(channel) as ConversationRow[])
      : (getDb()
          .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
          .all() as ConversationRow[]);
  return rows.map(rowToConversation);
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

  return {
    ...conversation,
    contact,
    messages: messageRows.map((row) =>
      rowToMessage(row, attachmentMap.get(row.id)),
    ),
    assignedOperator: conversation.assignedTo
      ? getOperator(conversation.assignedTo)
      : undefined,
  };
}

export function markConversationRead(id: string): void {
  getDb()
    .prepare("UPDATE conversations SET unread_count = 0 WHERE id = ?")
    .run(id);
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
        : findConversationByExternalThread(
            payload.channel,
            threadId,
          );
    if (!existing) return null;
    const lastMessage = getDb()
      .prepare(
        "SELECT * FROM messages WHERE external_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(payload.externalMessageId, existing.id) as MessageRow | undefined;
    if (!lastMessage) return null;
    return {
      message: rowToMessage(lastMessage),
      conversation: existing,
      created: false,
    };
  }

  let conversation =
    payload.channel === "max"
      ? findMaxConversation(maxChatId, maxUserId)
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
    if (isOutbound) {
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
          : findConversationByExternalThread(payload.channel, threadId)) ??
        conversation;
    }
  } else if (!conversation.assignedTo) {
    autoAssignOperator(conversation.id);
    conversation =
      (payload.channel === "max"
        ? findMaxConversation(maxChatId, maxUserId)
        : findConversationByExternalThread(payload.channel, threadId)) ??
      conversation;
  }

  const externalMid = payload.externalMessageId.replace(/^max-/, "");
  const duplicateOutbound = getDb()
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? AND external_id = ? LIMIT 1",
    )
    .get(conversation!.id, externalMid) as MessageRow | undefined;

  if (duplicateOutbound) {
    getDb()
      .prepare(
        "INSERT OR IGNORE INTO processed_external_ids (channel, external_message_id) VALUES (?, ?)",
      )
      .run(payload.channel, payload.externalMessageId);
    return {
      message: rowToMessage(duplicateOutbound),
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
    createdAt: new Date().toISOString(),
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
        isOutbound
          ? `UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?`
          : `UPDATE conversations SET last_message_preview = ?, updated_at = ?, unread_count = unread_count + 1 WHERE id = ?`,
      )
      .run(preview, message.createdAt, conversation!.id);
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
      `SELECT c.id, c.contact_id, c.external_thread_id, c.unread_count, c.last_message_preview, c.updated_at,
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
      let preview = keep.last_message_preview;
      let updatedAt = keep.updated_at;

      for (const dup of group.slice(1)) {
        db.prepare(
          "UPDATE messages SET conversation_id = ? WHERE conversation_id = ?",
        ).run(keep.id, dup.id);
        unread += dup.unread_count;
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
        "UPDATE conversations SET unread_count = ?, last_message_preview = ?, updated_at = ? WHERE id = ?",
      ).run(unread, preview, updatedAt, keep.id);
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

  return { imported, skipped };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  operatorId?: string,
  attachments?: OutboundAttachmentPayload[],
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

  const message: Message = {
    id: `m-${Date.now()}`,
    conversationId,
    content: trimmed,
    direction: "out",
    status: "sent",
    operatorId: senderId,
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
      "UPDATE conversations SET last_message_preview = ?, updated_at = ?, unread_count = 0 WHERE id = ?",
    )
    .run(preview, message.createdAt, conversationId);

  if (conversation.externalThreadId) {
    const result = await dispatchOutboundMessage({
      channel: conversation.channel,
      externalThreadId: conversation.externalThreadId,
      content: trimmed,
      attachments,
    });

    message.status = result.ok ? "delivered" : "failed";
    if (result.externalId) {
      message.externalId = result.externalId;
      getDb()
        .prepare(
          "INSERT OR IGNORE INTO processed_external_ids (channel, external_message_id) VALUES (?, ?)",
        )
        .run(
          conversation.channel,
          conversation.channel === "max"
            ? `max-${result.externalId}`
            : result.externalId,
        );
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
    const remote = await deleteChannelMessage({
      channel: message.channel,
      externalThreadId: message.externalThreadId,
      channelMessageId: message.externalId,
      revoke: options?.revoke ?? false,
    });
    if (!remote.ok && options?.revoke) {
      return { ok: false, error: remote.error ?? "Не удалось удалить в Telegram" };
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

export async function startOutboundConversation(params: {
  channel: Channel;
  externalThreadId: string;
  contactName: string;
  content: string;
  operatorId?: string;
  username?: string;
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

  let conversation = findConversationByExternalThread(
    params.channel,
    params.externalThreadId,
  );

  if (!conversation) {
    let contact = findContactByChannelUser(
      params.channel,
      params.externalThreadId,
    );

    if (!contact) {
      contact = {
        id: `c-${Date.now()}`,
        name: params.contactName,
        tags: ["Исходящий"],
        dealStage: "new",
        channelUserIds: { [params.channel]: params.externalThreadId },
        notes: params.username ? `@${params.username}` : undefined,
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
      "UPDATE conversations SET last_message_preview = ?, updated_at = ?, unread_count = unread_count + 1 WHERE id = ?",
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

// Touch DB on module load in Node runtime.
if (typeof window === "undefined") {
  getDb();
}
