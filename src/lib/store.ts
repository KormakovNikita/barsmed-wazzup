import { getAssignmentStrategy, pickOperatorForAssignment } from "./assignment";
import { ALL_CHANNELS } from "./channels";
import { dispatchOutboundMessage } from "./integrations";
import type {
  Channel,
  Contact,
  Conversation,
  ConversationDetail,
  IncomingMessagePayload,
  Message,
  Operator,
} from "./types";

const operators: Operator[] = [
  { id: "op-1", name: "Анна Петрова", avatarInitials: "АП", online: true },
  { id: "op-2", name: "Иван Сидоров", avatarInitials: "ИС", online: true },
  { id: "op-3", name: "Мария Козлова", avatarInitials: "МК", online: false },
];

const contacts: Contact[] = [
  {
    id: "c-1",
    name: "Дмитрий Волков",
    phone: "+7 903 123-45-67",
    email: "d.volkov@techstart.ru",
    company: "TechStart",
    tags: ["VIP", "B2B"],
    dealStage: "negotiation",
    notes: "Интересуется корпоративным тарифом на 50 лицензий.",
  },
  {
    id: "c-2",
    name: "Елена Смирнова",
    phone: "+7 916 987-65-43",
    company: "Смирнова Design",
    tags: ["Дизайн"],
    dealStage: "new",
    channelUserIds: { telegram: "demo-tg-2" },
  },
  {
    id: "c-3",
    name: "Алексей Морозов",
    phone: "+7 925 555-12-34",
    email: "a.morozov@gmail.com",
    tags: ["Поддержка"],
    dealStage: "proposal",
    notes: "Ждёт счёт до конца недели.",
  },
  {
    id: "c-4",
    name: "Ольга Новикова",
    phone: "+7 903 777-88-99",
    company: "Novikova Retail",
    tags: ["Розница", "Повтор"],
    dealStage: "won",
  },
  {
    id: "c-5",
    name: "Сергей Кузнецов",
    phone: "+7 916 333-22-11",
    tags: ["Холодный"],
    dealStage: "lost",
    notes: "Выбрал конкурента.",
  },
  {
    id: "c-6",
    name: "Наталья Белова",
    phone: "+7 903 444-55-66",
    email: "n.belova@corp.io",
    company: "Corp.io",
    tags: ["Enterprise"],
    dealStage: "negotiation",
    channelUserIds: { telegram: "demo-tg-6" },
  },
];

let conversations: Conversation[] = [
  {
    id: "conv-1",
    contactId: "c-1",
    channel: "whatsapp",
    assignedTo: "op-1",
    unreadCount: 2,
    lastMessagePreview: "Можете прислать коммерческое предложение?",
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: "conv-2",
    contactId: "c-2",
    channel: "telegram",
    externalThreadId: "demo-tg-2",
    assignedTo: "op-2",
    unreadCount: 0,
    lastMessagePreview: "Спасибо, посмотрю материалы!",
    updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "conv-3",
    contactId: "c-3",
    channel: "whatsapp",
    assignedTo: "op-1",
    unreadCount: 1,
    lastMessagePreview: "Когда будет готов счёт?",
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "conv-4",
    contactId: "c-4",
    channel: "vk",
    assignedTo: "op-3",
    unreadCount: 0,
    lastMessagePreview: "Отлично, ждём поставку на следующей неделе.",
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "conv-5",
    contactId: "c-5",
    channel: "instagram",
    unreadCount: 0,
    lastMessagePreview: "Пока не актуально, спасибо.",
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "conv-6",
    contactId: "c-6",
    channel: "telegram",
    externalThreadId: "demo-tg-6",
    assignedTo: "op-2",
    unreadCount: 3,
    lastMessagePreview: "Нужна интеграция с нашей CRM.",
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

const messages: Message[] = [
  {
    id: "m-1",
    conversationId: "conv-1",
    content: "Добрый день! Мы ищем решение для объединения WhatsApp и CRM.",
    direction: "in",
    status: "read",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-2",
    conversationId: "conv-1",
    content:
      "Здравствуйте, Дмитрий! Рады помочь. Расскажите, сколько менеджеров будет работать с системой?",
    direction: "out",
    status: "read",
    operatorId: "op-1",
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
  {
    id: "m-3",
    conversationId: "conv-1",
    content: "Примерно 15 человек в отделе продаж.",
    direction: "in",
    status: "read",
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-4",
    conversationId: "conv-1",
    content: "Можете прислать коммерческое предложение?",
    direction: "in",
    status: "delivered",
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: "m-5",
    conversationId: "conv-2",
    content: "Привет! Отправила презентацию на почту.",
    direction: "out",
    status: "read",
    operatorId: "op-2",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-6",
    conversationId: "conv-2",
    content: "Спасибо, посмотрю материалы!",
    direction: "in",
    status: "read",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "m-7",
    conversationId: "conv-3",
    content: "Добрый день, счёт ещё в работе?",
    direction: "in",
    status: "delivered",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-8",
    conversationId: "conv-3",
    content: "Когда будет готов счёт?",
    direction: "in",
    status: "delivered",
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "m-9",
    conversationId: "conv-4",
    content: "Заказ подтверждён, спасибо за сотрудничество!",
    direction: "out",
    status: "read",
    operatorId: "op-3",
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-10",
    conversationId: "conv-4",
    content: "Отлично, ждём поставку на следующей неделе.",
    direction: "in",
    status: "read",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-11",
    conversationId: "conv-5",
    content: "Пока не актуально, спасибо.",
    direction: "in",
    status: "read",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-12",
    conversationId: "conv-6",
    content: "Добрый день! Интересует ваш продукт для нашей команды.",
    direction: "in",
    status: "read",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "m-13",
    conversationId: "conv-6",
    content: "Нужна интеграция с нашей CRM.",
    direction: "in",
    status: "delivered",
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

const processedExternalIds = new Set<string>();

function getContact(id: string): Contact | undefined {
  return contacts.find((c) => c.id === id);
}

function getOperator(id: string): Operator | undefined {
  return operators.find((o) => o.id === id);
}

function findConversationByExternalThread(
  channel: Channel,
  externalThreadId: string,
): Conversation | undefined {
  return conversations.find(
    (c) => c.channel === channel && c.externalThreadId === externalThreadId,
  );
}

function findContactByChannelUser(
  channel: Channel,
  externalUserId: string,
): Contact | undefined {
  return contacts.find(
    (c) => c.channelUserIds?.[channel] === externalUserId,
  );
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
    notes: payload.senderUsername
      ? `@${payload.senderUsername}`
      : undefined,
  };
  contacts.push(contact);
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
  conversations.push(conversation);
  return conversation;
}

function autoAssignOperator(conversationId: string): string | null {
  const operator = pickOperatorForAssignment(
    operators,
    conversations,
    getAssignmentStrategy(),
  );
  if (!operator) return null;

  conversations = conversations.map((c) =>
    c.id === conversationId
      ? { ...c, assignedTo: operator.id, autoAssigned: true }
      : c,
  );

  return operator.id;
}

export function getContactForConversation(contactId: string): Contact | undefined {
  return contacts.find((c) => c.id === contactId);
}

export function listOperators(): Operator[] {
  return operators;
}

export function listConversations(channel?: Channel | "all"): Conversation[] {
  const filtered =
    channel && channel !== "all"
      ? conversations.filter((c) => c.channel === channel)
      : conversations;

  return [...filtered].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getConversationDetail(id: string): ConversationDetail | null {
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;

  const contact = getContact(conversation.contactId);
  if (!contact) return null;

  const convMessages = messages
    .filter((m) => m.conversationId === id)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  return {
    ...conversation,
    contact,
    messages: convMessages,
    assignedOperator: conversation.assignedTo
      ? getOperator(conversation.assignedTo)
      : undefined,
  };
}

export function markConversationRead(id: string): void {
  conversations = conversations.map((c) =>
    c.id === id ? { ...c, unreadCount: 0 } : c,
  );
}

export function processIncomingMessage(
  payload: IncomingMessagePayload,
): { message: Message; conversation: Conversation; created: boolean } | null {
  if (processedExternalIds.has(payload.externalMessageId)) {
    const existing = findConversationByExternalThread(
      payload.channel,
      payload.externalThreadId,
    );
    if (!existing) return null;
    const lastMessage = messages
      .filter((m) => m.externalId === payload.externalMessageId)
      .at(-1);
    if (!lastMessage) return null;
    return { message: lastMessage, conversation: existing, created: false };
  }

  processedExternalIds.add(payload.externalMessageId);

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
    } else if (!contact.channelUserIds?.[payload.channel]) {
      contact.channelUserIds = {
        ...contact.channelUserIds,
        [payload.channel]: payload.externalThreadId,
      };
    }

    conversation = createConversation(
      contact.id,
      payload.channel,
      payload.externalThreadId,
      payload.content,
    );
    created = true;

    const assignedId = autoAssignOperator(conversation.id);
    if (assignedId) {
      conversation =
        conversations.find((c) => c.id === conversation!.id) ?? conversation;
    }
  } else if (!conversation.assignedTo) {
    autoAssignOperator(conversation.id);
    conversation =
      conversations.find((c) => c.id === conversation!.id) ?? conversation;
  }

  const message: Message = {
    id: `m-${Date.now()}`,
    conversationId: conversation.id,
    content: payload.content,
    direction: "in",
    status: "delivered",
    externalId: payload.externalMessageId,
    createdAt: new Date().toISOString(),
  };

  messages.push(message);

  conversations = conversations.map((c) =>
    c.id === conversation!.id
      ? {
          ...c,
          lastMessagePreview: payload.content,
          updatedAt: message.createdAt,
          unreadCount: c.unreadCount + 1,
        }
      : c,
  );

  return {
    message,
    conversation: conversations.find((c) => c.id === conversation!.id)!,
    created,
  };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  operatorId = "op-1",
): Promise<Message | null> {
  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation || !content.trim()) return null;

  const message: Message = {
    id: `m-${Date.now()}`,
    conversationId,
    content: content.trim(),
    direction: "out",
    status: "sent",
    operatorId,
    createdAt: new Date().toISOString(),
  };

  messages.push(message);

  conversations = conversations.map((c) =>
    c.id === conversationId
      ? {
          ...c,
          lastMessagePreview: content.trim(),
          updatedAt: message.createdAt,
          unreadCount: 0,
        }
      : c,
  );

  if (conversation.externalThreadId) {
    const result = await dispatchOutboundMessage({
      channel: conversation.channel,
      externalThreadId: conversation.externalThreadId,
      content: content.trim(),
    });

    const status: Message["status"] = result.ok ? "delivered" : "failed";
    message.status = status;
    if (result.externalId) message.externalId = result.externalId;

    const index = messages.findIndex((m) => m.id === message.id);
    if (index >= 0) messages[index] = { ...message };
  }

  return message;
}

export function assignConversation(
  conversationId: string,
  operatorId: string | null,
): Conversation | null {
  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation) return null;

  const updated = {
    ...conversation,
    assignedTo: operatorId ?? undefined,
    autoAssigned: false,
  };

  conversations = conversations.map((c) =>
    c.id === conversationId ? updated : c,
  );

  return updated;
}

export function simulateIncomingMessage(
  conversationId: string,
  content: string,
): Message | null {
  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation || !content.trim()) return null;

  if (!conversation.assignedTo) {
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

  messages.push(message);

  conversations = conversations.map((c) =>
    c.id === conversationId
      ? {
          ...c,
          lastMessagePreview: content.trim(),
          updatedAt: message.createdAt,
          unreadCount: c.unreadCount + 1,
        }
      : c,
  );

  return message;
}

export function getStats() {
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const byChannel = ALL_CHANNELS.map((ch) => ({
    channel: ch,
    count: conversations.filter((c) => c.channel === ch).length,
    unread: conversations
      .filter((c) => c.channel === ch)
      .reduce((sum, c) => sum + c.unreadCount, 0),
  }));

  const unassigned = conversations.filter((c) => !c.assignedTo).length;

  return {
    totalUnread,
    totalConversations: conversations.length,
    unassigned,
    byChannel,
  };
}
