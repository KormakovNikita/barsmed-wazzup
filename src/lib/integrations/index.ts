import type { Channel, IncomingMessagePayload, OutboundMessagePayload } from "@/lib/types";
import {
  getMaxStatus,
  isMaxConfigured,
  sendMaxMessage,
} from "./max-channel";
import { parseMaxUpdate, type MaxUpdate } from "./max";
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
  const max = await getMaxStatus();

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
      configured: max.configured,
      connected: max.connected,
      mode: max.mode,
      profile: max.profile,
      error: max.error,
      webhooks: max.webhooks,
      transport: max.transport,
    },
    webhookBaseUrl: webhookBase ?? null,
    assignmentStrategy:
      process.env.ASSIGNMENT_STRATEGY === "round_robin"
        ? "round_robin"
        : "least_loaded",
  };
}
