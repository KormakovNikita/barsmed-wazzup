import { getMaxBotInfo } from "@/lib/integrations/max";
import { processIncomingMessage } from "@/lib/store";
import type { MaxProxyMessage } from "webmaxsocket";
import type { WebMaxClient } from "webmaxsocket";
import {
  downloadVoiceFromMessage,
  findVoiceAttachmentIndex,
  isVoiceAttachment,
} from "./voice";

let cachedBotUserId: number | null | undefined;

async function getBotUserId(): Promise<number | null> {
  if (cachedBotUserId !== undefined) return cachedBotUserId;
  const info = await getMaxBotInfo();
  cachedBotUserId = info.bot?.userId ?? null;
  return cachedBotUserId;
}

function normalizeId(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

export async function processMaxProxyVoiceMessage(
  client: WebMaxClient,
  message: MaxProxyMessage,
): Promise<boolean> {
  const voiceIndex = findVoiceAttachmentIndex(message);
  if (voiceIndex < 0) return false;

  const botUserId = await getBotUserId();
  const senderId = message.senderId;
  if (botUserId && senderId === botUserId) {
    return false;
  }

  const chatId = normalizeId(message.chatId);
  const userId = normalizeId(senderId);
  if (!chatId && !userId) return false;

  const externalMessageId = `max-proxy-${normalizeId(message.id) ?? Date.now()}`;

  const voice = await downloadVoiceFromMessage(client, message, voiceIndex);
  if (!voice?.buffer.length) {
    console.warn("[max-proxy] voice attachment found but download failed", {
      messageId: message.id,
      chatId,
    });
    return false;
  }

  await message.fetchSender();
  const senderName = message.getSenderName();

  const attachment = message.attachments[voiceIndex];
  const durationMs =
    typeof attachment.duration === "number" ? attachment.duration : undefined;
  const durationLabel =
    durationMs && durationMs > 1000
      ? `${Math.round(durationMs / 1000)} сек`
      : durationMs
        ? `${Math.round(durationMs / 1000)} сек`
        : undefined;

  const result = processIncomingMessage({
    channel: "max",
    externalThreadId: chatId ?? userId!,
    maxChatId: chatId ?? undefined,
    maxUserId: userId ?? undefined,
    externalMessageId,
    channelMessageId: normalizeId(message.id) ?? undefined,
    content: durationLabel ? `🎤 Голосовое (${durationLabel})` : "🎤 Голосовое",
    senderName,
    direction: "in",
    attachments: [
      {
        type: "voice",
        mimeType: voice.mimeType,
        fileName: voice.fileName,
        fileSize: voice.buffer.length,
        buffer: voice.buffer,
      },
    ],
  });

  return Boolean(result);
}

export function messageHasVoice(message: MaxProxyMessage): boolean {
  return message.attachments.some(isVoiceAttachment);
}
