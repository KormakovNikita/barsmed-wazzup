import type { OutboundMessagePayload } from "@/lib/types";
import {
  getMaxBotInfo,
  getMaxBotToken,
  isMaxBotConfigured,
  listMaxSubscriptions,
  registerMaxWebhook,
  sendMaxMessage as sendMaxBotMessage,
} from "./max";
import {
  disconnectMaxUser,
  getMaxUserMode,
  getMaxUserProfile,
  getMaxUserStatus,
  isMaxUserAuthorized,
  isMaxUserConfigured,
  sendMaxUserMessage,
  startMaxUserListener,
} from "./max-user";

export function getMaxMode(): "bot" | "user" {
  return getMaxUserMode();
}

export function isMaxConfigured(): boolean {
  if (getMaxMode() === "user") {
    return isMaxUserConfigured();
  }
  return isMaxBotConfigured();
}

export async function isMaxConnected(): Promise<boolean> {
  if (getMaxMode() === "user") {
    return isMaxUserAuthorized();
  }
  if (!isMaxBotConfigured()) return false;
  const info = await getMaxBotInfo();
  return info.ok;
}

export async function sendMaxMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (getMaxMode() === "user") {
    return sendMaxUserMessage(
      payload.externalThreadId,
      payload.content,
      payload.attachments,
      payload.replyToChannelMessageId,
    );
  }
  return sendMaxBotMessage(payload);
}

export async function getMaxStatus() {
  const webhookBase = process.env.WEBHOOK_BASE_URL;
  const mode = getMaxMode();

  if (mode === "user") {
    const profile = await getMaxUserProfile();
    const status = getMaxUserStatus();
    return {
      mode: "user" as const,
      configured: status.configured,
      connected: Boolean(profile),
      profile: profile
        ? {
            userId: profile.userId,
            name: profile.name,
            username: profile.username,
          }
        : null,
      error: status.configured && !profile ? "Сессия MAX недействительна" : null,
      webhooks: [],
      transport: "user-account" as const,
    };
  }

  const botInfo = isMaxBotConfigured() ? await getMaxBotInfo() : null;
  const maxSubs = isMaxBotConfigured() ? await listMaxSubscriptions() : null;

  return {
    mode: (webhookBase ? "webhook" : "polling") as "webhook" | "polling",
    configured: isMaxBotConfigured(),
    connected: botInfo?.ok ?? false,
    profile: botInfo?.bot ?? null,
    error: botInfo?.ok === false ? botInfo.error : null,
    webhooks: maxSubs?.subscriptions ?? [],
    transport: "bot-api" as const,
  };
}

export {
  disconnectMaxUser,
  getMaxBotToken,
  getMaxUserMode,
  isMaxBotConfigured,
  isMaxUserConfigured,
  listMaxSubscriptions,
  registerMaxWebhook,
  startMaxUserListener,
};

export { deleteMaxWebhook } from "./max";
