import type { Channel, IncomingMessagePayload, OutboundMessagePayload } from "@/lib/types";
import {
  isMaxConfigured,
  parseMaxUpdate,
  sendMaxMessage,
  type MaxUpdate,
} from "./max";
import {
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

  return {
    telegram: {
      configured: telegram.configured,
      connected: telegram.connected,
      mode: telegram.mode,
      profile: telegram.profile,
    },
    max: {
      configured: isMaxConfigured(),
      mode: webhookBase ? "webhook" : "polling",
      connected: isMaxConfigured(),
    },
    webhookBaseUrl: webhookBase ?? null,
    assignmentStrategy:
      process.env.ASSIGNMENT_STRATEGY === "round_robin"
        ? "round_robin"
        : "least_loaded",
  };
}
