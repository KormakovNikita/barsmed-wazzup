import type { Channel, IncomingMessagePayload, OutboundMessagePayload } from "@/lib/types";
import {
  getMaxBotInfo,
  isMaxConfigured,
  listMaxSubscriptions,
  parseMaxUpdate,
  sendMaxMessage,
  type MaxUpdate,
} from "./max";
import {
  deleteTelegramMessage,
  getTelegramMode,
  getTelegramStatus,
  isTelegramConfigured,
  parseTelegramUpdate,
  sendTelegramMessage,
  type TelegramUpdate,
} from "./telegram";

export async function dispatchOutboundMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  switch (payload.channel) {
    case "telegram":
      return sendTelegramMessage(payload);
    case "max":
      if (payload.attachments?.length) {
        return { ok: false, error: "MAX пока поддерживает только текст" };
      }
      return sendMaxMessage(payload);
    default:
      return { ok: true };
  }
}

export async function deleteChannelMessage(params: {
  channel: Channel;
  externalThreadId: string;
  channelMessageId: string;
  revoke?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (params.channel === "telegram") {
    return deleteTelegramMessage({
      externalThreadId: params.externalThreadId,
      channelMessageId: params.channelMessageId,
      revoke: params.revoke,
    });
  }
  return { ok: true };
}

export function isChannelIntegrationActive(channel: Channel): boolean {
  if (channel === "telegram") return isTelegramConfigured();
  if (channel === "max") return isMaxConfigured();
  return false;
}

export function parseTelegramWebhookBody(
  body: TelegramUpdate,
): IncomingMessagePayload | null {
  const parsed = parseTelegramUpdate(body);
  if (!parsed) return null;

  return {
    channel: "telegram",
    ...parsed,
  };
}

export function parseMaxWebhookBody(
  body: MaxUpdate,
): IncomingMessagePayload | null {
  const parsed = parseMaxUpdate(body);
  if (!parsed) return null;

  return {
    channel: "max",
    ...parsed,
  };
}

export async function getIntegrationStatus() {
  const webhookBase = process.env.WEBHOOK_BASE_URL;
  const telegram = await getTelegramStatus();
  const maxConfigured = isMaxConfigured();
  const maxInfo = maxConfigured ? await getMaxBotInfo() : null;
  const maxSubs = maxConfigured ? await listMaxSubscriptions() : null;

  return {
    telegram: {
      configured: telegram.configured,
      connected: telegram.connected,
      mode: telegram.mode,
      profile: telegram.profile,
      error: "error" in telegram ? telegram.error : null,
      webhooks: "webhooks" in telegram ? telegram.webhooks : [],
      wazzupChannelId:
        "wazzupChannelId" in telegram ? telegram.wazzupChannelId : null,
    },
    max: {
      configured: maxConfigured,
      connected: maxInfo?.ok ?? false,
      mode: webhookBase ? "webhook" : "polling",
      profile: maxInfo?.bot ?? null,
      error: maxInfo?.ok === false ? maxInfo.error : null,
      webhooks: maxSubs?.subscriptions ?? [],
    },
    webhookBaseUrl: webhookBase ?? null,
    assignmentStrategy:
      process.env.ASSIGNMENT_STRATEGY === "round_robin"
        ? "round_robin"
        : "least_loaded",
  };
}
