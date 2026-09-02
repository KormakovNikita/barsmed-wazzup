import type { OutboundMessagePayload } from "@/lib/types";
import {
  deleteVkApiMessage,
  editVkApiMessage,
  sendVkApiMessage,
} from "./api";
import { getVkAccessToken } from "./config";

function parseVkPeerAndMessageId(externalId: string): {
  peerId: number;
  messageId: number;
} | null {
  const match = externalId.match(/^vk-(\d+)-(\d+)$/);
  if (!match) return null;
  const peerId = Number(match[1]);
  const messageId = Number(match[2]);
  if (!Number.isFinite(peerId) || !Number.isFinite(messageId)) return null;
  return { peerId, messageId };
}

export async function sendVkMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const token = getVkAccessToken();
  if (!token) {
    return { ok: false, error: "VK: токен сообщества не задан" };
  }

  const peerId = Number(payload.externalThreadId);
  if (!Number.isFinite(peerId)) {
    return { ok: false, error: "VK: некорректный peer_id" };
  }

  const replyTo = payload.replyToChannelMessageId
    ? Number(payload.replyToChannelMessageId)
    : undefined;

  const result = await sendVkApiMessage({
    accessToken: token,
    peerId,
    message: payload.content,
    replyTo: Number.isFinite(replyTo) ? replyTo : undefined,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    externalId: `vk-${peerId}-${result.messageId}`,
  };
}

export async function editVkMessage(params: {
  externalThreadId: string;
  externalId: string;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const token = getVkAccessToken();
  if (!token) {
    return { ok: false, error: "VK: токен сообщества не задан" };
  }

  const ids = parseVkPeerAndMessageId(params.externalId);
  if (!ids) {
    return { ok: false, error: "VK: некорректный ID сообщения" };
  }

  const result = await editVkApiMessage({
    accessToken: token,
    peerId: ids.peerId,
    messageId: ids.messageId,
    message: params.content,
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function deleteVkMessage(params: {
  externalThreadId: string;
  externalId: string;
  revoke?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const token = getVkAccessToken();
  if (!token) {
    return { ok: false, error: "VK: токен сообщества не задан" };
  }

  const ids = parseVkPeerAndMessageId(params.externalId);
  if (!ids) {
    return { ok: false, error: "VK: некорректный ID сообщения" };
  }

  const result = await deleteVkApiMessage({
    accessToken: token,
    peerId: ids.peerId,
    messageIds: [ids.messageId],
    deleteForAll: params.revoke ?? false,
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
