import { processIncomingMessage } from "@/lib/store";
import type { MaxProxyMessage } from "webmaxsocket";
import type { WebMaxClient } from "webmaxsocket";
import {
  downloadVoiceFromMessage,
  findVoiceAttachmentIndex,
  isVoiceAttachment,
} from "@/lib/integrations/max-proxy/voice";

function normalizeId(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

export function messageHasVoice(message: MaxProxyMessage): boolean {
  return message.attachments.some(isVoiceAttachment);
}

export async function processMaxPersonalMessage(
  client: WebMaxClient,
  message: MaxProxyMessage,
): Promise<boolean> {
  if (message.senderId != null && client.me?.id != null) {
    if (String(message.senderId) === String(client.me.id)) {
      return false;
    }
  }

  const chatId = normalizeId(message.chatId);
  const userId = normalizeId(message.senderId);
  if (!chatId && !userId) return false;

  const messageId = normalizeId(message.id);
  const externalMessageId = `max-personal-${messageId ?? Date.now()}`;

  const voiceIndex = findVoiceAttachmentIndex(message);
  if (voiceIndex >= 0) {
    const voice = await downloadVoiceFromMessage(client, message, voiceIndex);
    if (!voice?.buffer.length) return false;

    await message.fetchSender();
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
      channel: "max_personal",
      externalThreadId: chatId ?? userId!,
      maxChatId: chatId ?? undefined,
      maxUserId: userId ?? undefined,
      externalMessageId,
      channelMessageId: messageId ?? undefined,
      content: durationLabel ? `🎤 Голосовое (${durationLabel})` : "🎤 Голосовое",
      senderName: message.getSenderName(),
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

  const text = message.text?.trim() ?? "";
  if (!text) return false;

  await message.fetchSender();

  const result = processIncomingMessage({
    channel: "max_personal",
    externalThreadId: chatId ?? userId!,
    maxChatId: chatId ?? undefined,
    maxUserId: userId ?? undefined,
    externalMessageId,
    channelMessageId: messageId ?? undefined,
    content: text,
    senderName: message.getSenderName(),
    direction: "in",
  });

  return Boolean(result);
}
