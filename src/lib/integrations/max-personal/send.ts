import type { OutboundMessagePayload } from "@/lib/types";
import { getMaxPersonalClient } from "@/lib/integrations/max-personal/client";
import { ensureMaxPersonalDialogChatId } from "@/lib/integrations/max-personal/dialog";

function extractMessageId(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;

  if ("error" in result && result.error) return undefined;

  if ("id" in result && result.id != null) {
    return String(result.id);
  }

  return undefined;
}

function extractSendError(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  if (!("error" in result) || !result.error) return undefined;

  const payload = result as {
    error?: string;
    localizedMessage?: string;
    message?: string;
  };

  return (
    payload.localizedMessage ??
    payload.message ??
    String(payload.error)
  );
}

export async function sendMaxPersonalMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string; chatId?: string }> {
  const client = await getMaxPersonalClient();
  if (!client?.isAuthorized) {
    return { ok: false, error: "MAX Personal не подключён. Войдите по QR в настройках." };
  }

  if (!client.isConnected) {
    return {
      ok: false,
      error: "MAX Personal не подключён к серверу. Повторите отправку через несколько секунд.",
    };
  }

  if (payload.attachments?.length) {
    return {
      ok: false,
      error: "Отправка файлов через MAX Personal пока не поддерживается",
    };
  }

  const text = payload.content.trim();
  if (!text) {
    return { ok: false, error: "Пустое сообщение" };
  }

  const userId = payload.maxUserId ?? payload.externalThreadId;

  try {
    const chatId = await ensureMaxPersonalDialogChatId(client, userId);
    const result = await client.sendMessage({ chatId, text });

    const sendError = extractSendError(result);
    if (sendError) {
      return { ok: false, error: sendError };
    }

    const messageId = extractMessageId(result);
    if (!messageId) {
      return {
        ok: false,
        error: "MAX не подтвердил отправку сообщения",
        chatId,
      };
    }

    return {
      ok: true,
      chatId,
      externalId: `max-personal-${messageId}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ошибка отправки MAX Personal",
    };
  }
}
