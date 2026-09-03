import type { AnyMessageContent } from "@whiskeysockets/baileys/lib/Types/Message.js";
import type { OutboundAttachmentPayload, OutboundMessagePayload } from "@/lib/types";
import {
  getWhatsAppSocket,
  isWhatsAppReconnecting,
  isWhatsAppSocketLive,
} from "@/lib/integrations/whatsapp/client";
import { resolveOutboundWhatsAppJid } from "@/lib/integrations/whatsapp/lid";
import {
  formatWhatsAppPhoneDisplay,
  isWhatsAppLidIdentifier,
  isWhatsAppPhoneIdentifier,
  normalizeWhatsAppPhone,
} from "@/lib/integrations/whatsapp/phone";

const MIN_SEND_INTERVAL_MS = 1500;
let lastSendAt = 0;

function waitForSendSlot(): Promise<void> {
  const now = Date.now();
  const waitMs = lastSendAt + MIN_SEND_INTERVAL_MS - now;
  if (waitMs <= 0) {
    lastSendAt = now;
    return Promise.resolve();
  }
  lastSendAt = now + waitMs;
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

function buildWhatsAppMessageContent(
  attachment: OutboundAttachmentPayload,
  caption?: string,
): AnyMessageContent {
  const text = caption?.trim() || undefined;

  switch (attachment.type) {
    case "image":
    case "sticker":
      return { image: attachment.buffer, caption: text, mimetype: attachment.mimeType };
    case "video":
      return { video: attachment.buffer, caption: text, mimetype: attachment.mimeType };
    case "voice":
      return {
        audio: attachment.buffer,
        ptt: true,
        mimetype: attachment.mimeType || "audio/ogg; codecs=opus",
      };
    case "audio":
      return { audio: attachment.buffer, mimetype: attachment.mimeType };
    default:
      return {
        document: attachment.buffer,
        mimetype: attachment.mimeType || "application/octet-stream",
        fileName: attachment.fileName ?? "file",
        caption: text,
      };
  }
}

export async function sendWhatsAppMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const sock = await getWhatsAppSocket();
  if (!sock?.user || !isWhatsAppSocketLive()) {
    const reconnecting = isWhatsAppReconnecting();
    return {
      ok: false,
      error: reconnecting
        ? "WhatsApp переподключается. Подождите несколько секунд и отправьте снова."
        : "WhatsApp не подключён. Отсканируйте QR в настройках и проверьте WHATSAPP_PROXY.",
    };
  }

  const threadId = payload.externalThreadId.trim();
  if (
    !threadId ||
    (!isWhatsAppPhoneIdentifier(threadId) && !isWhatsAppLidIdentifier(threadId))
  ) {
    return { ok: false, error: "Некорректный номер WhatsApp" };
  }

  const jid = await resolveOutboundWhatsAppJid(sock, threadId);
  if (!jid) {
    return { ok: false, error: "Не удалось определить получателя WhatsApp" };
  }

  const text = payload.content.trim();
  const attachment = payload.attachments?.[0];

  if (!text && !attachment) {
    return { ok: false, error: "Пустое сообщение" };
  }

  try {
    await waitForSendSlot();

    const quoted =
      payload.replyToChannelMessageId != null
        ? {
            key: {
              remoteJid: jid,
              id: payload.replyToChannelMessageId,
            },
          }
        : undefined;

    const content: AnyMessageContent = attachment
      ? buildWhatsAppMessageContent(attachment, text)
      : { text };

    const result = await sock.sendMessage(jid, content, { quoted });

    const messageId = result?.key?.id;
    if (!messageId) {
      return { ok: false, error: "WhatsApp не подтвердил отправку" };
    }

    return { ok: true, externalId: messageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ошибка отправки WhatsApp";
    if (/proxy|timeout|econnrefused|enotfound|network|fetch failed/i.test(message)) {
      return {
        ok: false,
        error:
          "Не удалось достучаться до WhatsApp. Проверьте VPN/прокси (WHATSAPP_PROXY).",
      };
    }
    return { ok: false, error: message };
  }
}

export async function resolveWhatsAppPeer(
  identifier: string,
): Promise<{ phone: string; name: string } | null> {
  const sock = await getWhatsAppSocket();
  if (!sock?.user) return null;

  const phone = normalizeWhatsAppPhone(identifier);
  if (!phone || phone.length < 10) return null;

  try {
    const lookup = await sock.onWhatsApp(phone);
    const result = lookup?.[0];
    if (result && !result.exists) {
      return null;
    }

    return { phone, name: formatWhatsAppPhoneDisplay(phone) };
  } catch {
    return { phone, name: formatWhatsAppPhoneDisplay(phone) };
  }
}
