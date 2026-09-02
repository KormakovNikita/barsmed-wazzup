import type { IncomingMessagePayload } from "@/lib/types";
import { getVkUsers } from "./api";
import { getVkAccessToken } from "./config";

/** Legacy Long Poll: [4, message_id, flags, peer_id, timestamp, text, ...] */
const LONG_POLL_MESSAGE_NEW = 4;
const OUTGOING_FLAG = 2;

export interface VkCallbackMessage {
  id: number;
  date: number;
  peer_id: number;
  from_id: number;
  text?: string;
  out?: number;
  reply_message?: { id: number };
}

export interface VkCallbackEvent {
  type: string;
  object?: {
    message?: VkCallbackMessage;
  };
  group_id?: number;
  secret?: string;
}

function peerToThreadId(peerId: number): string {
  return String(peerId);
}

function formatUserName(user: {
  first_name?: string;
  last_name?: string;
}): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

async function resolveSenderName(fromId: number): Promise<string> {
  const token = getVkAccessToken();
  if (!token || fromId <= 0) {
    return fromId > 0 ? `VK user ${fromId}` : "VK user";
  }

  const users = await getVkUsers([fromId], token);
  if (!users.ok || !users.users[0]) {
    return `VK user ${fromId}`;
  }

  const name = formatUserName(users.users[0]);
  return name || `VK user ${fromId}`;
}

export function parseVkLongPollUpdate(
  update: unknown,
): Omit<
  IncomingMessagePayload,
  "channel" | "senderName"
> & { fromId: number } | null {
  if (!Array.isArray(update) || update[0] !== LONG_POLL_MESSAGE_NEW) {
    return null;
  }

  const messageId = Number(update[1]);
  const flags = Number(update[2]);
  const peerId = Number(update[3]);
  const text = typeof update[5] === "string" ? update[5].trim() : "";

  if (!Number.isFinite(messageId) || !Number.isFinite(peerId)) {
    return null;
  }

  if (flags & OUTGOING_FLAG) {
    return null;
  }

  if (!text) {
    return null;
  }

  const fromId = peerId > 0 && peerId < 2_000_000_000 ? peerId : peerId;

  return {
    externalThreadId: peerToThreadId(peerId),
    externalMessageId: `vk-${peerId}-${messageId}`,
    channelMessageId: String(messageId),
    content: text,
    fromId,
  };
}

export async function parseVkCallbackEvent(
  event: VkCallbackEvent,
): Promise<IncomingMessagePayload | null> {
  if (event.type !== "message_new") return null;

  const message = event.object?.message;
  if (!message) return null;
  if (message.out === 1) return null;

  const text = message.text?.trim() ?? "";
  if (!text) return null;

  const peerId = message.peer_id;
  const fromId = message.from_id > 0 ? message.from_id : peerId;
  const senderName = await resolveSenderName(fromId);

  return {
    channel: "vk",
    externalThreadId: peerToThreadId(peerId),
    externalMessageId: `vk-${peerId}-${message.id}`,
    channelMessageId: String(message.id),
    content: text,
    senderName,
    replyToChannelMessageId: message.reply_message?.id
      ? String(message.reply_message.id)
      : undefined,
  };
}

export async function enrichVkLongPollPayload(
  partial: Omit<IncomingMessagePayload, "channel" | "senderName"> & {
    fromId: number;
  },
): Promise<IncomingMessagePayload> {
  const senderName = await resolveSenderName(partial.fromId);
  const { fromId: _fromId, ...rest } = partial;
  return {
    channel: "vk",
    senderName,
    ...rest,
  };
}

export function verifyVkCallbackSecret(
  event: VkCallbackEvent,
  secret: string | null,
): boolean {
  if (!secret) return true;
  return event.secret === secret;
}
