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
import { getMaxIncomingMode, getMaxWebhookBaseUrl, getWazzupMaxStatus, getWazzupWebhookBaseUrl, isMaxIncomingConfigured, sendWazzupMaxMessage, shouldMaxUsePolling } from "./wazzup-max";

export async function dispatchOutboundMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  switch (payload.channel) {
    case "telegram":
      return sendTelegramMessage(payload);
    case "max":
      return getMaxIncomingMode() === "wazzup"
        ? sendWazzupMaxMessage(payload)
        : sendMaxMessage(payload);
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
  if (channel === "max") return isMaxIncomingConfigured();
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
  const maxWebhookBase = getMaxWebhookBaseUrl();
  const wazzupWebhookBase = getWazzupWebhookBaseUrl();
  const telegram = await getTelegramStatus();
  const maxIncoming = getMaxIncomingMode();
  const maxConfigured = isMaxIncomingConfigured();
  const maxInfo =
    maxIncoming !== "wazzup" && isMaxConfigured()
      ? await getMaxBotInfo()
      : null;
  const maxSubs =
    maxIncoming !== "wazzup" && isMaxConfigured()
      ? await listMaxSubscriptions()
      : null;
  const wazzupMax =
    maxIncoming === "wazzup" ? await getWazzupMaxStatus() : null;

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
      connected:
        maxIncoming === "wazzup"
          ? (wazzupMax?.connected ?? false)
          : (maxInfo?.ok ?? false),
      incomingMode: maxIncoming,
      mode:
        maxIncoming === "wazzup"
          ? "wazzup"
          : shouldMaxUsePolling()
            ? "polling"
            : "webhook",
      profile:
        maxIncoming === "wazzup" && wazzupMax?.channelName
          ? {
              userId: 0,
              name: wazzupMax.channelName,
            }
          : (maxInfo?.bot ?? null),
      error:
        maxIncoming === "wazzup"
          ? (wazzupMax?.error ?? null)
          : maxInfo?.ok === false
            ? maxInfo.error
            : null,
      webhooks: maxSubs?.subscriptions ?? [],
      wazzupRelay: wazzupMax
        ? {
            configured: wazzupMax.configured,
            connected: wazzupMax.connected,
            channelId: wazzupMax.channelId,
            channelName: wazzupMax.channelName,
            transport: wazzupMax.transport,
            webhookUrl: wazzupMax.webhookUrl,
            error: wazzupMax.error ?? null,
          }
        : null,
    },
    webhookBaseUrl: webhookBase ?? null,
    maxWebhookBaseUrl: maxWebhookBase,
    wazzupWebhookBaseUrl: wazzupWebhookBase,
    assignmentStrategy:
      process.env.ASSIGNMENT_STRATEGY === "round_robin"
        ? "round_robin"
        : "least_loaded",
  };
}
