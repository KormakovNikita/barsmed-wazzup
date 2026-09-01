import type { IncomingMessagePayload, OutboundMessagePayload } from "@/lib/types";
import { isWazzupConfigured } from "@/lib/integrations/wazzup-import";

const WAZZUP_API = "https://api.wazzup24.com";

function wazzupHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.WAZZUP_API_KEY}`,
    "Content-Type": "application/json",
  };
}

interface WazzupChannel {
  channelId: string;
  transport: string;
  plainId?: string;
  state?: string;
  name?: string;
}

export interface WazzupMessage {
  messageId: string;
  channelId: string;
  chatType: string;
  chatId: string;
  dateTime?: string;
  type?: string;
  status?: string;
  text?: string;
  authorName?: string;
  isEcho?: boolean;
  contact?: {
    name?: string;
    username?: string;
    phone?: string;
  };
}

export function isWazzupTelegramConfigured(): boolean {
  return isWazzupConfigured();
}

export async function listWazzupChannels(): Promise<WazzupChannel[]> {
  if (!isWazzupConfigured()) return [];

  const response = await fetch(`${WAZZUP_API}/v3/channels`, {
    headers: wazzupHeaders(),
    cache: "no-store",
  });

  if (!response.ok) return [];

  const data = (await response.json()) as
    | WazzupChannel[]
    | { data?: WazzupChannel[] };
  return Array.isArray(data) ? data : (data.data ?? []);
}

export async function findWazzupTelegramChannelId(): Promise<string | null> {
  const configured = process.env.WAZZUP_TELEGRAM_CHANNEL_ID;
  if (configured) return configured;

  const channels = await listWazzupChannels();
  const telegramChannel = channels.find(
    (ch) =>
      (ch.transport === "telegram" || ch.transport === "tgapi") &&
      ch.state === "active",
  );

  return (
    telegramChannel?.channelId ??
    channels.find(
      (ch) => ch.transport === "telegram" || ch.transport === "tgapi",
    )?.channelId ??
    null
  );
}

export async function getWazzupTelegramStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  channelId: string | null;
  channelName: string | null;
  webhookUrl: string | null;
  error?: string;
}> {
  if (!isWazzupConfigured()) {
    return {
      configured: false,
      connected: false,
      channelId: null,
      channelName: null,
      webhookUrl: null,
    };
  }

  const channels = await listWazzupChannels();
  const channelId = await findWazzupTelegramChannelId();
  const channel = channels.find((ch) => ch.channelId === channelId);

  if (!channelId) {
    return {
      configured: true,
      connected: false,
      channelId: null,
      channelName: null,
      webhookUrl: null,
      error:
        "Не найден Telegram-канал в Wazzup. Подключите личный Telegram в личном кабинете Wazzup.",
    };
  }

  const webhookInfo = await getWazzupWebhookInfo();

  return {
    configured: true,
    connected: true,
    channelId,
    channelName: channel?.name ?? channel?.plainId ?? null,
    webhookUrl: webhookInfo.webhooksUri ?? null,
  };
}

export async function getWazzupWebhookInfo(): Promise<{
  webhooksUri?: string;
  messagesAndStatuses?: boolean;
}> {
  if (!isWazzupConfigured()) return {};

  const response = await fetch(`${WAZZUP_API}/v3/webhooks`, {
    headers: wazzupHeaders(),
    cache: "no-store",
  });

  if (!response.ok) return {};

  return (await response.json()) as {
    webhooksUri?: string;
    messagesAndStatuses?: boolean;
  };
}

export async function registerWazzupWebhook(
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isWazzupConfigured()) {
    return { ok: false, error: "WAZZUP_API_KEY не задан" };
  }

  const response = await fetch(`${WAZZUP_API}/v3/webhooks`, {
    method: "PATCH",
    headers: wazzupHeaders(),
    body: JSON.stringify({
      webhooksUri: webhookUrl,
      subscriptions: {
        messagesAndStatuses: true,
        contactsAndDealsCreation: false,
        channelsUpdates: false,
        wabaTemplatesStatus: false,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `Wazzup webhooks ${response.status}` };
  }

  return { ok: true };
}

export function parseWazzupTelegramMessage(
  msg: WazzupMessage,
): IncomingMessagePayload | null {
  if (msg.chatType !== "telegram" || !msg.text?.trim()) return null;

  const isOutbound = msg.isEcho === true;
  const contactName =
    msg.contact?.name ??
    (isOutbound ? msg.authorName ?? "Сотрудник" : msg.contact?.name) ??
    msg.contact?.username ??
    "Telegram";

  return {
    channel: "telegram",
    externalThreadId: msg.chatId,
    externalMessageId: `wazzup-${msg.messageId}`,
    channelMessageId: msg.messageId,
    content: msg.text.trim(),
    senderName: contactName,
    senderUsername: msg.contact?.username,
    direction: isOutbound ? "out" : "in",
  };
}

export async function sendWazzupTelegramMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!isWazzupConfigured()) {
    return { ok: false, error: "WAZZUP_API_KEY не задан" };
  }

  const channelId = await findWazzupTelegramChannelId();
  if (!channelId) {
    return {
      ok: false,
      error: "Не найден Telegram-канал в Wazzup",
    };
  }

  const threadId = payload.externalThreadId.trim();
  const body: Record<string, string> = {
    channelId,
    chatType: "telegram",
    text: payload.content,
  };

  if (/^\d+$/.test(threadId)) {
    body.chatId = threadId;
  } else if (threadId.startsWith("@")) {
    body.username = threadId.slice(1);
  } else if (threadId.startsWith("+")) {
    body.phone = threadId;
  } else if (/^\d/.test(threadId)) {
    body.chatId = threadId;
  } else {
    body.username = threadId;
  }

  const response = await fetch(`${WAZZUP_API}/v3/message`, {
    method: "POST",
    headers: wazzupHeaders(),
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    messageId?: string;
    chatId?: string;
    error?: string;
    description?: string;
  };

  if (!response.ok) {
    return {
      ok: false,
      error: data.description ?? data.error ?? `Wazzup ${response.status}`,
    };
  }

  return {
    ok: true,
    externalId: data.messageId,
  };
}
