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
import {
  getWazzupTelegramStatus,
  isWazzupTelegramConfigured,
  sendWazzupTelegramMessage,
} from "./wazzup-telegram";

export type { TelegramUpdate } from "./telegram-bot";

export function getTelegramMode(): "user" | "bot" | "wazzup" {
  return getTelegramUserMode();
}

export function isTelegramConfigured(): boolean {
  const mode = getTelegramMode();
  if (mode === "user") return isTelegramUserConfigured();
  if (mode === "wazzup") return isWazzupTelegramConfigured();
  return isTelegramBotConfigured();
}

export { isTelegramBotConfigured } from "./telegram-bot";

export async function isTelegramConnected(): Promise<boolean> {
  const mode = getTelegramMode();
  if (mode === "user") return isTelegramUserAuthorized();
  if (mode === "wazzup") {
    const status = await getWazzupTelegramStatus();
    return status.connected;
  }
  return isTelegramBotConfigured();
}

export async function sendTelegramMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const mode = getTelegramMode();
  if (mode === "user") {
    return sendTelegramUserMessage(payload.externalThreadId, payload.content);
  }
  if (mode === "wazzup") {
    return sendWazzupTelegramMessage(payload);
  }
  return sendTelegramBotMessage(payload);
}

export function parseTelegramUpdate(update: TelegramUpdate) {
  return parseTelegramBotUpdate(update);
}

export async function pollTelegramUpdates(offset?: number) {
  const mode = getTelegramMode();
  if (mode === "user") {
    await startTelegramUserListener();
    const { drainTelegramUserUpdates } = await import(
      "@/lib/integrations/telegram-user-polling",
    );
    await drainTelegramUserUpdates();
    return { updates: [] as TelegramUpdate[], nextOffset: offset };
  }
  if (mode === "wazzup") {
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

  if (mode === "wazzup") {
    const wazzup = await getWazzupTelegramStatus();
    return {
      mode: "wazzup" as const,
      configured: wazzup.configured,
      connected: wazzup.connected,
      profile: wazzup.channelName
        ? {
            id: wazzup.channelId ?? "",
            name: wazzup.channelName,
            username: undefined,
          }
        : null,
      error: wazzup.error ?? null,
      webhooks: wazzup.webhookUrl ? [{ url: wazzup.webhookUrl }] : [],
      wazzupChannelId: wazzup.channelId,
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
  restartTelegramUserListener,
  startTelegramUserListener,
} from "./telegram-user";

export { startTelegramQrAuth } from "./telegram-user/qr-auth";

export {
  getWazzupTelegramStatus,
  registerWazzupWebhook,
  parseWazzupTelegramMessage,
} from "./wazzup-telegram";
