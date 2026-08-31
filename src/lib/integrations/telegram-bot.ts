import type { OutboundMessagePayload } from "@/lib/types";

const TELEGRAM_API = "https://api.telegram.org";

export function isTelegramBotConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function getTelegramBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export async function sendTelegramBotMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN не задан" };
  }

  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: payload.externalThreadId,
      text: payload.content,
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  };

  if (!data.ok) {
    return { ok: false, error: data.description ?? "Telegram API error" };
  }

  return {
    ok: true,
    externalId: String(data.result?.message_id),
  };
}

export async function setTelegramWebhook(webhookUrl: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN не задан" };
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const response = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      allowed_updates: ["message"],
    }),
  });

  const data = (await response.json()) as { ok: boolean; description?: string };
  return data.ok
    ? { ok: true }
    : { ok: false, error: data.description ?? "setWebhook failed" };
}

export async function deleteTelegramWebhook(): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) return;
  await fetch(`${TELEGRAM_API}/bot${token}/deleteWebhook`);
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      is_bot?: boolean;
    };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

export function parseTelegramBotUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.text || !message.from) return null;
  if (message.from.is_bot) return null;

  const name = [message.from.first_name, message.from.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    externalThreadId: String(message.chat.id),
    externalMessageId: `tg-bot-${update.update_id}-${message.message_id}`,
    content: message.text,
    senderName: name || message.from.username || "Telegram user",
    senderUsername: message.from.username,
  };
}

export async function pollTelegramBotUpdates(
  offset?: number,
): Promise<{ updates: TelegramUpdate[]; nextOffset?: number }> {
  const token = getTelegramBotToken();
  if (!token) return { updates: [] };

  const params = new URLSearchParams({ timeout: "0", limit: "50" });
  if (offset !== undefined) params.set("offset", String(offset));

  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/getUpdates?${params.toString()}`,
  );
  const data = (await response.json()) as {
    ok: boolean;
    result?: TelegramUpdate[];
  };

  if (!data.ok || !data.result?.length) {
    return { updates: [] };
  }

  const updates = data.result;
  const nextOffset = updates[updates.length - 1].update_id + 1;
  return { updates, nextOffset };
}

export function verifyTelegramWebhookSecret(request: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === secret;
}
