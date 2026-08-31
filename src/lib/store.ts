import { getDb, isDatabaseEmpty } from "@/lib/db";
import { ALL_CHANNELS } from "@/lib/channels";
import { getAssignmentStrategy, pickOperatorForAssignment } from "@/lib/assignment";
import { dispatchOutboundMessage } from "@/lib/integrations";
import type {
  Channel,
  Contact,
  Conversation,
  ConversationDetail,
  DealStage,
  IncomingMessagePayload,
  Message,
  Operator,
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

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    content: row.content,
    direction: row.direction,
    status: row.status,
    operatorId: row.operator_id ?? undefined,
    externalId: row.external_id ?? undefined,
    createdAt: row.created_at,
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

function createContactFromInbound(payload: IncomingMessagePayload): Contact {
  const contact: Contact = {
    id: `c-${Date.now()}`,
    name: payload.senderName,
    tags: [payload.channel === "max" ? "MAX" : "Telegram"],
    dealStage: "new",
    channelUserIds: {
      [payload.channel]: payload.externalThreadId,
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

  return {
    ...conversation,
    contact,
    messages: messageRows.map(rowToMessage),
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

  if (payload.channel === "max") {
    registerMaxKnownChat({
      chatId: payload.externalThreadId,
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
    const existing = findConversationByExternalThread(
      payload.channel,
      payload.externalThreadId,
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

  let conversation = findConversationByExternalThread(
    payload.channel,
    payload.externalThreadId,
  );
  let created = false;

  if (!conversation) {
    let contact = findContactByChannelUser(
      payload.channel,
      payload.externalThreadId,
    );
    if (!contact) {
      contact = createContactFromInbound(payload);
    } else {
      if (!contact.channelUserIds?.[payload.channel]) {
        contact.channelUserIds = {
          ...contact.channelUserIds,
          [payload.channel]: payload.externalThreadId,
        };
        upsertContact(contact);
      }
    }

    conversation = createConversation(
      contact.id,
      payload.channel,
      payload.externalThreadId,
      payload.content,
    );
    created = true;
    autoAssignOperator(conversation.id);
    conversation =
      findConversationByExternalThread(
        payload.channel,
        payload.externalThreadId,
      ) ?? conversation;
  } else if (!conversation.assignedTo) {
    autoAssignOperator(conversation.id);
    conversation =
      findConversationByExternalThread(
        payload.channel,
        payload.externalThreadId,
      ) ?? conversation;
  }

  const message: Message = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    conversationId: conversation.id,
    content: payload.content,
    direction: "in",
    status: "delivered",
    externalId: payload.externalMessageId,
    createdAt: new Date().toISOString(),
  };

  const tx = getDb().transaction(() => {
    getDb()
      .prepare(
        "INSERT INTO processed_external_ids (channel, external_message_id) VALUES (?, ?)",
      )
      .run(payload.channel, payload.externalMessageId);
    insertMessage(message);
    getDb()
      .prepare(
        `UPDATE conversations SET last_message_preview = ?, updated_at = ?, unread_count = unread_count + 1 WHERE id = ?`,
      )
      .run(payload.content, message.createdAt, conversation!.id);
  });
  tx();

  return {
    message,
    conversation:
      findConversationByExternalThread(
        payload.channel,
        payload.externalThreadId,
      )!,
    created,
  };
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
): Promise<{ message: Message | null; error?: string }> {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(conversationId) as ConversationRow | undefined;
  if (!row || !content.trim()) {
    return { message: null, error: "Диалог не найден" };
  }

  const conversation = rowToConversation(row);
  const senderId = operatorId ?? conversation.assignedTo ?? "op-1";

  const message: Message = {
    id: `m-${Date.now()}`,
    conversationId,
    content: content.trim(),
    direction: "out",
    status: "sent",
    operatorId: senderId,
    createdAt: new Date().toISOString(),
  };

  insertMessage(message);
  getDb()
    .prepare(
      "UPDATE conversations SET last_message_preview = ?, updated_at = ?, unread_count = 0 WHERE id = ?",
    )
    .run(content.trim(), message.createdAt, conversationId);

  if (conversation.externalThreadId) {
    const result = await dispatchOutboundMessage({
      channel: conversation.channel,
      externalThreadId: conversation.externalThreadId,
      content: content.trim(),
    });

    message.status = result.ok ? "delivered" : "failed";
    if (result.externalId) message.externalId = result.externalId;
    updateMessage(message);

    if (!result.ok) {
      return { message, error: result.error ?? "Не удалось отправить сообщение" };
    }
  }

  return { message };
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
