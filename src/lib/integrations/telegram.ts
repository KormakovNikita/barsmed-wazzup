import type { IncomingMessagePayload, OutboundMessagePayload } from "@/lib/types";
import {
  getTelegramBotInfo,
  getTelegramWebhookInfo,
  isTelegramBotConfigured,
  parseTelegramBotUpdate,
  pollTelegramBotUpdates,
  sendTelegramBotMessage,
  verifyTelegramWebhookSecret as verifyBotWebhookSecret,
  type TelegramUpdate,
} from "./telegram-bot";
import {
  getTelegramUserMode,
  getTelegramUserProfile,
  getTelegramUserStatus,
  isTelegramUserAuthorized,
  isTelegramUserConfigured,
  sendTelegramUserMessage,
  startTelegramUserListener,
} from "./telegram-user";

export type { TelegramUpdate } from "./telegram-bot";

export function getTelegramMode(): "user" | "bot" {
  return getTelegramUserMode();
}

export function isTelegramConfigured(): boolean {
  if (getTelegramMode() === "user") {
    return isTelegramUserConfigured();
  }
  return isTelegramBotConfigured();
}

export { isTelegramBotConfigured } from "./telegram-bot";

export async function isTelegramConnected(): Promise<boolean> {
  if (getTelegramMode() === "user") {
    return isTelegramUserAuthorized();
  }
  return isTelegramBotConfigured();
}

export async function sendTelegramMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (getTelegramMode() === "user") {
    return sendTelegramUserMessage(payload.externalThreadId, payload.content);
  }
  return sendTelegramBotMessage(payload);
}

export function parseTelegramUpdate(update: TelegramUpdate) {
  return parseTelegramBotUpdate(update);
}

export async function pollTelegramUpdates(offset?: number) {
  if (getTelegramMode() === "user") {
    await startTelegramUserListener();
    return { updates: [] as TelegramUpdate[], nextOffset: offset };
  }
  return pollTelegramBotUpdates(offset);
}

export { verifyBotWebhookSecret as verifyTelegramWebhookSecret };

export { setTelegramWebhook, deleteTelegramWebhook } from "./telegram-bot";

export async function getTelegramStatus() {
  const mode = getTelegramMode();
  const webhookBase = process.env.WEBHOOK_BASE_URL;

  if (mode === "user") {
    const profile = await getTelegramUserProfile();
    return {
      mode: "user" as const,
      ...getTelegramUserStatus(),
      connected: Boolean(profile),
      profile,
    };
  }

  const botInfo = isTelegramBotConfigured()
    ? await getTelegramBotInfo()
    : null;
  const webhookInfo = isTelegramBotConfigured()
    ? await getTelegramWebhookInfo()
    : null;

  return {
    mode: (webhookBase ? "webhook" : "polling") as "webhook" | "polling",
    configured: isTelegramBotConfigured(),
    connected: botInfo?.ok ?? false,
    profile: botInfo?.bot
      ? {
          id: String(botInfo.bot.id),
          name: botInfo.bot.name,
          username: botInfo.bot.username,
        }
      : null,
    error: botInfo?.ok === false ? botInfo.error : null,
    webhooks: webhookInfo?.url ? [{ url: webhookInfo.url }] : [],
  };
}

export function parseTelegramWebhookBody(
  body: TelegramUpdate,
): IncomingMessagePayload | null {
  const parsed = parseTelegramBotUpdate(body);
  if (!parsed) return null;
  return { channel: "telegram", ...parsed };
}

export {
  startTelegramAuth,
  completeTelegramAuth,
  disconnectTelegramUser,
  resolveTelegramPeer,
  startTelegramUserListener,
} from "./telegram-user";
