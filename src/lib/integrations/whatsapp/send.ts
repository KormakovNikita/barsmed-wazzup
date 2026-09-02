import type { OutboundMessagePayload } from "@/lib/types";
import {
  getWhatsAppSocket,
  isWhatsAppSocketLive,
} from "@/lib/integrations/whatsapp/client";
import {
  formatWhatsAppPhoneDisplay,
  normalizeWhatsAppPhone,
  phoneToWhatsAppJid,
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

export async function sendWhatsAppMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const sock = await getWhatsAppSocket();
  if (!sock?.user || !isWhatsAppSocketLive()) {
    return {
      ok: false,
      error:
        "WhatsApp не подключён. Отсканируйте QR в настройках и проверьте WHATSAPP_PROXY.",
    };
  }

  const phone = normalizeWhatsAppPhone(payload.externalThreadId);
  if (!phone || phone.length < 10) {
    return { ok: false, error: "Некорректный номер WhatsApp" };
  }

  const jid = phoneToWhatsAppJid(phone);
  const text = payload.content.trim();

  if (payload.attachments?.length) {
    return {
      ok: false,
      error: "Отправка файлов через WhatsApp пока не поддерживается",
    };
  }

  if (!text) {
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

    const result = await sock.sendMessage(jid, { text }, { quoted });

    const messageId = result?.key?.id;
    if (!messageId) {
      return { ok: false, error: "WhatsApp не подтвердил отправку" };
    }

    return { ok: true, externalId: messageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ошибка отправки WhatsApp";
    if (/proxy|timeout|econnrefused|enotfound|network/i.test(message)) {
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
