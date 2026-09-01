import {
  getMaxApiBase,
  getMaxBotInfo,
  getMaxBotToken,
} from "@/lib/integrations/max";
import {
  downloadMaxAttachments,
  isMaxMediaAttachment,
  maxAttachmentPreview,
  type MaxMessageAttachment,
} from "@/lib/integrations/max-media";
import {
  findOrCreateMaxConversation,
  importHistoricalMessages,
  importMessageWithAttachments,
  listConversations,
  listMaxKnownChatIds,
  refreshConversationReplyState,
  backfillMissingMaxExternalIds,
} from "@/lib/store";

export interface MaxHistoryMessage {
  externalId: string;
  content: string;
  direction: "in" | "out";
  createdAt: string;
  senderUserId?: number;
  senderName?: string;
  attachments?: MaxMessageAttachment[];
}

interface MaxApiMessage {
  timestamp?: number;
  body?: {
    mid?: string;
    text?: string;
    attachments?: MaxMessageAttachment[];
  };
  sender?: {
    user_id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot?: boolean;
  };
}

export async function fetchMaxChatMessages(
  chatId: string,
  options?: { maxPages?: number },
): Promise<MaxApiMessage[]> {
  const token = getMaxBotToken();
  if (!token) return [];

  const maxPages = options?.maxPages ?? 200;
  const collected: MaxApiMessage[] = [];
  let to: number | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      chat_id: chatId,
      count: "100",
    });
    if (to !== undefined) {
      params.set("to", String(to));
    }

    const response = await fetch(`${getMaxApiBase()}/messages?${params}`, {
      headers: { Authorization: token },
      cache: "no-store",
    });

    if (!response.ok) break;

    const data = (await response.json()) as { messages?: MaxApiMessage[] };
    const batch = data.messages ?? [];
    if (batch.length === 0) break;

    collected.push(...batch);

    const oldest = batch[batch.length - 1]?.timestamp;
    if (!oldest || batch.length < 100) break;
    to = oldest - 1;
  }

  return collected;
}

export function mapMaxApiMessagesToHistory(
  apiMessages: MaxApiMessage[],
  botUserId: number,
): MaxHistoryMessage[] {
  const mapped = apiMessages
    .filter((msg) => msg.body?.mid)
    .map((msg) => {
      const sender = msg.sender;
      const isBot =
        sender?.is_bot === true || sender?.user_id === botUserId;
      const name = [sender?.first_name, sender?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const attachments = msg.body?.attachments ?? [];
      const mediaAttachments = attachments.filter(isMaxMediaAttachment);
      const text = msg.body?.text?.trim() ?? "";

      let content = text;
      if (!content && mediaAttachments.length) {
        content = maxAttachmentPreview(attachments);
      } else if (!content) {
        content = "[сообщение без текста]";
      }

      return {
        externalId: msg.body!.mid!,
        content,
        direction: isBot ? ("out" as const) : ("in" as const),
        createdAt: new Date(msg.timestamp ?? Date.now()).toISOString(),
        senderUserId: sender?.user_id,
        senderName: name || sender?.username || undefined,
        attachments: mediaAttachments.length ? attachments : undefined,
      };
    });

  return mapped.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

async function importMaxHistoryWithMedia(
  conversationId: string,
  history: MaxHistoryMessage[],
): Promise<{ imported: number; skipped: number; attachmentsAdded: number }> {
  let imported = 0;
  let skipped = 0;
  let attachmentsAdded = 0;

  for (const item of history) {
    const downloaded = item.attachments?.length
      ? await downloadMaxAttachments(item.attachments, {
          messageId: item.externalId,
        })
      : undefined;

    const result = importMessageWithAttachments(conversationId, {
      externalId: item.externalId,
      content: item.content,
      direction: item.direction,
      createdAt: item.createdAt,
      attachments: downloaded?.length ? downloaded : undefined,
    });

    if (result.imported) imported += 1;
    else if (result.skipped) skipped += 1;
    attachmentsAdded += result.attachmentsAdded;
  }

  refreshConversationReplyState(conversationId);

  return { imported, skipped, attachmentsAdded };
}

export async function syncMaxChatHistory(chatId: string): Promise<{
  ok: boolean;
  chatId: string;
  conversationId?: string;
  imported: number;
  skipped: number;
  attachmentsAdded: number;
  externalIdsPatched?: number;
  totalFetched: number;
  error?: string;
}> {
  const botInfo = await getMaxBotInfo();
  if (!botInfo.ok || !botInfo.bot) {
    return {
      ok: false,
      chatId,
      imported: 0,
      skipped: 0,
      attachmentsAdded: 0,
      totalFetched: 0,
      error: botInfo.error ?? "MAX не настроен",
    };
  }

  const apiMessages = await fetchMaxChatMessages(chatId);
  const history = mapMaxApiMessagesToHistory(apiMessages, botInfo.bot.userId);

  if (history.length === 0) {
    return {
      ok: true,
      chatId,
      imported: 0,
      skipped: 0,
      attachmentsAdded: 0,
      totalFetched: 0,
    };
  }

  const firstUserMessage = history.find((m) => m.direction === "in");
  const conversation = findOrCreateMaxConversation({
    chatId,
    userId: firstUserMessage?.senderUserId
      ? String(firstUserMessage.senderUserId)
      : undefined,
    senderName:
      firstUserMessage?.senderName ??
      history.find((m) => m.senderName)?.senderName ??
      "Клиент MAX",
    preview: history[history.length - 1]?.content ?? "",
  });

  const result = await importMaxHistoryWithMedia(conversation.id, history);
  const externalIdsPatched = backfillMissingMaxExternalIds(
    conversation.id,
    history,
  );

  return {
    ok: true,
    chatId,
    conversationId: conversation.id,
    imported: result.imported,
    skipped: result.skipped,
    attachmentsAdded: result.attachmentsAdded,
    externalIdsPatched,
    totalFetched: history.length,
  };
}

/** Re-fetch MAX history and import missing messages / attachments */
export async function backfillMaxChatMedia(chatId: string): Promise<{
  ok: boolean;
  chatId: string;
  conversationId?: string;
  imported: number;
  skipped: number;
  attachmentsAdded: number;
  totalFetched: number;
  error?: string;
}> {
  return syncMaxChatHistory(chatId);
}

export async function backfillAllMaxMedia(options?: {
  chatIds?: string[];
}): Promise<{
  ok: boolean;
  synced: Awaited<ReturnType<typeof backfillMaxChatMedia>>[];
  error?: string;
}> {
  const botInfo = await getMaxBotInfo();
  if (!botInfo.ok) {
    return { ok: false, synced: [], error: botInfo.error };
  }

  const knownChatIds = new Set<string>();

  if (options?.chatIds?.length) {
    for (const chatId of options.chatIds) {
      if (chatId.trim()) knownChatIds.add(chatId.trim());
    }
  } else {
    for (const conv of listConversations("max")) {
      if (conv.externalThreadId) {
        knownChatIds.add(conv.externalThreadId);
      }
    }

    for (const chatId of listMaxKnownChatIds()) {
      knownChatIds.add(chatId);
    }
  }

  const synced: Awaited<ReturnType<typeof backfillMaxChatMedia>>[] = [];
  for (const chatId of knownChatIds) {
    synced.push(await backfillMaxChatMedia(chatId));
  }

  return { ok: true, synced };
}

export async function syncAllMaxHistory(options?: {
  chatIds?: string[];
}): Promise<{
  ok: boolean;
  synced: Awaited<ReturnType<typeof syncMaxChatHistory>>[];
  error?: string;
}> {
  return backfillAllMaxMedia(options);
}

/** Legacy text-only import for Wazzup migration paths */
export function importMaxTextHistory(
  conversationId: string,
  history: Omit<MaxHistoryMessage, "attachments">[],
): { imported: number; skipped: number } {
  return importHistoricalMessages(conversationId, history);
}
