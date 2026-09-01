import { getPeerId } from "teleproto/Utils";
import type { Api } from "teleproto/tl";
import type { CustomMessage } from "teleproto/tl/custom/message";
import { processIncomingMessage } from "@/lib/store";

type IncomingTelegramMessage = CustomMessage | Api.Message;

function getThreadId(message: IncomingTelegramMessage): string | null {
  if ("peerId" in message && message.peerId) {
    return getPeerId(message.peerId);
  }
  if ("chatId" in message && message.chatId != null) {
    return message.chatId.toString();
  }
  return null;
}

function getMessageText(message: IncomingTelegramMessage): string | null {
  const text =
    ("text" in message && message.text) ||
    ("message" in message && message.message) ||
    "";
  const trimmed = String(text).trim();
  if (trimmed) return trimmed;
  if ("media" in message && message.media) {
    return "[медиа]";
  }
  return null;
}

async function resolveSenderInfo(message: IncomingTelegramMessage): Promise<{
  name: string;
  username?: string;
  skip: boolean;
}> {
  if (!("getSender" in message) || typeof message.getSender !== "function") {
    return { name: "Telegram", skip: false };
  }

  const sender = await message.getSender();
  if (!sender) {
    return { name: "Telegram", skip: false };
  }

  if ("bot" in sender && sender.bot) {
    return { name: "Bot", skip: true };
  }

  if ("firstName" in sender) {
    const name = [sender.firstName, sender.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      name: name || sender.username || "Telegram",
      username: sender.username ?? undefined,
      skip: false,
    };
  }

  if ("title" in sender) {
    return { name: String(sender.title), skip: false };
  }

  return { name: "Telegram", skip: false };
}

export async function processTelegramUserMessage(
  message: IncomingTelegramMessage,
): Promise<{ conversationId: string; created: boolean } | null> {
  if (!message || ("out" in message && message.out)) return null;

  const content = getMessageText(message);
  if (!content) return null;

  const threadId = getThreadId(message);
  if (!threadId) return null;

  const { name, username, skip } = await resolveSenderInfo(message);
  if (skip) return null;

  const messageId = "id" in message ? message.id : 0;
  const messageDate = "date" in message ? message.date : 0;

  const result = processIncomingMessage({
    channel: "telegram",
    externalThreadId: threadId,
    externalMessageId: `tg-user-${messageId}-${messageDate}`,
    content,
    senderName: name,
    senderUsername: username,
  });

  if (!result) return null;

  console.info(
    `[telegram-user] processed message from ${name} (${threadId}): ${content.slice(0, 80)}`,
  );

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
