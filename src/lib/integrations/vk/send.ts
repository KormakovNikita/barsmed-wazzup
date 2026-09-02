import type { OutboundMessagePayload } from "@/lib/types";
import { sendVkApiMessage } from "./api";
import { getVkAccessToken } from "./config";

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
