import {
  getMaxApiBase,
  getMaxBotInfo,
  getMaxBotToken,
} from "@/lib/integrations/max";
import {
  findOrCreateMaxConversation,
  importHistoricalMessages,
  listConversations,
  listMaxKnownChatIds,
} from "@/lib/store";

export interface MaxHistoryMessage {
  externalId: string;
  content: string;
  direction: "in" | "out";
  createdAt: string;
  senderUserId?: number;
  senderName?: string;
}

interface MaxApiMessage {
  timestamp?: number;
  body?: { mid?: string; text?: string };
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

      return {
        externalId: msg.body!.mid!,
        content: msg.body?.text?.trim() || "[сообщение без текста]",
        direction: isBot ? ("out" as const) : ("in" as const),
        createdAt: new Date(msg.timestamp ?? Date.now()).toISOString(),
        senderUserId: sender?.user_id,
        senderName: name || sender?.username || undefined,
      };
    });

  return mapped.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export async function syncMaxChatHistory(chatId: string): Promise<{
  ok: boolean;
  chatId: string;
  conversationId?: string;
  imported: number;
  skipped: number;
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

  const result = importHistoricalMessages(conversation.id, history);

  return {
    ok: true,
    chatId,
    conversationId: conversation.id,
    imported: result.imported,
    skipped: result.skipped,
    totalFetched: history.length,
  };
}

export async function syncAllMaxHistory(options?: {
  chatIds?: string[];
}): Promise<{
  ok: boolean;
  synced: Awaited<ReturnType<typeof syncMaxChatHistory>>[];
  error?: string;
}> {
  const botInfo = await getMaxBotInfo();
  if (!botInfo.ok) {
    return { ok: false, synced: [], error: botInfo.error };
  }

  const knownChatIds = new Set<string>();

  for (const conv of listConversations("max")) {
    if (conv.externalThreadId) {
      knownChatIds.add(conv.externalThreadId);
    }
  }

  for (const chatId of listMaxKnownChatIds()) {
    knownChatIds.add(chatId);
  }

  for (const chatId of options?.chatIds ?? []) {
    if (chatId.trim()) knownChatIds.add(chatId.trim());
  }

  const synced: Awaited<ReturnType<typeof syncMaxChatHistory>>[] = [];
  for (const chatId of knownChatIds) {
    synced.push(await syncMaxChatHistory(chatId));
  }

  return { ok: true, synced };
}
