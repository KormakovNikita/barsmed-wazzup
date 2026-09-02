import type { OutboundMessagePayload } from "@/lib/types";
import { getMaxPersonalClient } from "@/lib/integrations/max-personal/client";

export async function sendMaxPersonalMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const client = await getMaxPersonalClient();
  if (!client?.isAuthorized) {
    return { ok: false, error: "MAX Personal не подключён. Войдите по QR в настройках." };
  }

  if (payload.attachments?.length) {
    return {
      ok: false,
      error: "Отправка файлов через MAX Personal пока не поддерживается",
    };
  }

  const chatId = payload.maxChatId ?? payload.maxUserId ?? payload.externalThreadId;
  const text = payload.content.trim();
  if (!text) {
    return { ok: false, error: "Пустое сообщение" };
  }

  try {
    const result = await client.sendMessage({ chatId, text });
    const messageId =
      result && typeof result === "object" && "id" in result && result.id != null
        ? String(result.id)
        : undefined;

    return {
      ok: true,
      externalId: messageId ? `max-personal-${messageId}` : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ошибка отправки MAX Personal",
    };
  }
}
